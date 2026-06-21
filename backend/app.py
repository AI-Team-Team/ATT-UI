import os
import sqlite3
import logging
import asyncio
import json
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from att_runner import ATTRunner, broadcaster, save_chat_message

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ATT-UI.Server")

app = FastAPI(title="ATT-UI Workspace API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this. For local development, allow all.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "db"))
os.makedirs(DB_DIR, exist_ok=True)


class ProjectCreate(BaseModel):
    name: str
    prompt: str

class ChatMessage(BaseModel):
    prompt: str

class FileWrite(BaseModel):
    lib_id: str
    path: str
    content: str

# Helper to run ATT discussion in background
active_runners: Dict[str, ATTRunner] = {}

def get_runner(project_name: str) -> ATTRunner:
    db_name = f"{project_name}.db"
    db_path = os.path.join(DB_DIR, db_name)
    workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    if project_name not in active_runners:
        active_runners[project_name] = ATTRunner(
            project_id=project_name,
            db_path=db_path,
            workspace_dir=workspace_dir
        )
    return active_runners[project_name]

@app.get("/api/projects")
async def list_projects():
    """Lists all available projects by scanning the database folder."""
    projects = []
    if os.path.exists(DB_DIR):
        for file in os.listdir(DB_DIR):
            if file.endswith(".db"):
                name = file[:-3]
                db_path = os.path.join(DB_DIR, file)
                try:
                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()
                    
                    # Get config key if exists
                    cursor.execute("SELECT config_value FROM manager_config WHERE config_key='att_config'")
                    row = cursor.fetchone()
                    
                    # Count teams
                    cursor.execute("SELECT COUNT(*) FROM teams")
                    teams_count = cursor.fetchone()[0]
                    
                    # Count agents
                    cursor.execute("SELECT COUNT(*) FROM agents")
                    agents_count = cursor.fetchone()[0]

                    conn.close()
                    projects.append({
                        "name": name,
                        "teams": teams_count,
                        "agents": agents_count,
                        "updated_at": os.path.getmtime(db_path)
                    })
                except Exception as e:
                    logger.error(f"Error reading DB info for {file}: {e}")
                    projects.append({
                        "name": name,
                        "error": str(e)
                    })
    return sorted(projects, key=lambda p: p.get("updated_at", 0), reverse=True)

@app.post("/api/projects")
async def create_project(data: ProjectCreate, background_tasks: BackgroundTasks):
    """Creates a new project database and triggers initial ATT task."""
    project_name = data.name.strip().replace(" ", "_")
    if not project_name:
        raise HTTPException(status_code=400, detail="Invalid project name.")

    db_path = os.path.join(DB_DIR, f"{project_name}.db")
    if os.path.exists(db_path):
        raise HTTPException(status_code=400, detail="Project already exists.")

    runner = get_runner(project_name)
    
    # Run the initial debate as a background task to keep API responsive
    background_tasks.add_task(runner.run_task, data.prompt)

    return {"name": project_name, "status": "initializing"}

@app.delete("/api/projects/{name}")
async def delete_project(name: str):
    """Deletes a project by closing connections, removing physical library files, and deleting the DB file."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")

    # Check if the project is currently running a task
    if name in active_runners:
        runner = active_runners[name]
        if runner.is_running:
            raise HTTPException(status_code=400, detail="Cannot delete project while task is actively running.")

    try:
        # Before deleting the DB, query its libraries so we can delete physical doc library files
        lib_ids = []
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT lib_id FROM libraries")
            rows = cursor.fetchall()
            lib_ids = [row[0] for row in rows]
            conn.close()
        except Exception as e:
            logger.warning(f"Could not read libraries from {name}.db for cleanup: {e}")

        # Delete physical doc library directories
        for lib_id in lib_ids:
            target_dir = os.path.abspath(os.path.join(".att_doc_libs", lib_id))
            if os.path.exists(target_dir):
                import shutil
                try:
                    shutil.rmtree(target_dir)
                except Exception as e:
                    logger.warning(f"Could not delete physical library folder {target_dir}: {e}")

        # Remove the runner instance
        if name in active_runners:
            active_runners.pop(name)

        # Delete database file
        os.remove(db_path)

        # Broadcast deletion to all listeners
        await broadcaster.broadcast({
            "project_id": name,
            "type": "project_deleted",
            "data": {"project_name": name}
        })

        return {"status": "success", "message": f"Project '{name}' deleted successfully."}
    except Exception as e:
        logger.error(f"Error deleting project {name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {e}")

@app.post("/api/projects/{name}/chat")
async def send_chat(name: str, data: ChatMessage, background_tasks: BackgroundTasks):
    """Sends a new instruction to the active project team."""
    runner = get_runner(name)
    if runner.is_running:
        raise HTTPException(status_code=400, detail="Project is currently running a task.")

    background_tasks.add_task(runner.run_task, data.prompt)
    return {"status": "started"}

@app.get("/api/projects/{name}/state")
async def get_state(name: str):
    """Reads database tables and serializes current manager state."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Fetch Config
        cursor.execute("SELECT config_value FROM manager_config WHERE config_key='att_config'")
        config_row = cursor.fetchone()
        config = json.loads(config_row["config_value"]) if config_row else {}

        # 2. Fetch Agents
        cursor.execute("SELECT * FROM agents")
        agents_rows = cursor.fetchall()
        agents = []
        for a in agents_rows:
            # Fetch message list
            cursor.execute("SELECT role, content, created_at FROM agent_messages WHERE agent_name=? ORDER BY created_at", (a["name"],))
            msg_rows = cursor.fetchall()
            messages = [{"role": m["role"], "content": m["content"]} for m in msg_rows]

            runner = get_runner(name)
            last_context = json.loads(a["last_context"]) if a["last_context"] else {}
            if a["name"] in runner.agent_statuses:
                last_context["status"] = runner.agent_statuses[a["name"]]
            else:
                last_context["status"] = "Idle"

            agents.append({
                "name": a["name"],
                "role": a["role"],
                "role_description": a["role_description"],
                "system_instructions": a["system_instructions"],
                "model_alias": a["model_alias"],
                "last_context": last_context,
                "messages": messages
            })

        # 3. Fetch Teams
        cursor.execute("SELECT * FROM teams")
        teams_rows = cursor.fetchall()
        teams = []
        for t in teams_rows:
            # Fetch members
            cursor.execute("SELECT agent_name FROM team_members WHERE team_id=?", (t["team_id"],))
            member_rows = cursor.fetchall()
            members = [m["agent_name"] for m in member_rows]

            # Fetch inbox
            cursor.execute("SELECT sender, msg_type, payload, created_at FROM team_inbox WHERE team_id=? ORDER BY created_at", (t["team_id"],))
            inbox_rows = cursor.fetchall()
            inbox = [json.loads(i["payload"]) for i in inbox_rows]

            # Fetch proposals
            cursor.execute("SELECT * FROM team_proposals WHERE team_id=?", (t["team_id"],))
            proposal_rows = cursor.fetchall()
            proposals = []
            for p in proposal_rows:
                proposals.append({
                    "proposal_id": p["proposal_id"],
                    "action": p["action"],
                    "target": p["target"],
                    "initiator_type": p["initiator_type"],
                    "initiator_name": p["initiator_name"],
                    "rationale": p["rationale"],
                    "proposed_details": json.loads(p["proposed_details"]) if p["proposed_details"] else {},
                    "votes": json.loads(p["votes"]) if p["votes"] else {},
                    "status": p["status"]
                })

            teams.append({
                "team_id": t["team_id"],
                "preset_name": t["preset_name"],
                "team_purpose": t["team_purpose"],
                "team_progress": t["team_progress"],
                "depth": t["depth"],
                "chapter_num": t["chapter_num"],
                "parent_team_id": t["parent_team_id"],
                "migration_count": t["migration_count"],
                "creator_type": t["creator_type"],
                "creator_id": t["creator_id"],
                "communication_rules": json.loads(t["communication_rules"]) if t["communication_rules"] else {},
                "status_map": {
                    m: runner.agent_statuses.get(m, (json.loads(t["status_map"]) if t["status_map"] else {}).get(m, "Idle"))
                    for m in members
                },
                "system_instructions": t["system_instructions"],
                "members": members,
                "inbox": inbox,
                "proposals": proposals
            })

        # 4. Fetch Agreements
        cursor.execute("SELECT * FROM broker_agreements")
        agreement_rows = cursor.fetchall()
        agreements = [{"sender_team_id": r["sender_team_id"], "recipient_team_id": r["recipient_team_id"]} for r in agreement_rows]

        # 5. Fetch Libraries
        cursor.execute("SELECT * FROM libraries")
        lib_rows = cursor.fetchall()
        libraries = []
        for l in lib_rows:
            # Fetch library permissions
            cursor.execute("SELECT path, team_id, permission FROM library_permissions WHERE lib_id=?", (l["lib_id"],))
            perm_rows = cursor.fetchall()
            permissions = []
            for p in perm_rows:
                permissions.append({
                    "path": p["path"],
                    "team_id": p["team_id"],
                    "permission": p["permission"]
                })

            # Fetch files list
            cursor.execute("SELECT path, LENGTH(content) as size FROM doc_lib_files WHERE lib_id=?", (l["lib_id"],))
            file_rows = cursor.fetchall()
            files = [{"path": f["path"], "size_bytes": f["size"]} for f in file_rows]

            libraries.append({
                "lib_id": l["lib_id"],
                "name": l["name"],
                "owner_team_id": l["owner_team_id"],
                "description": l["description"],
                "is_public_visible": bool(l["is_public_visible"]),
                "permissions": permissions,
                "files": files
            })

        # 6. Fetch User Chat History
        chat_history = []
        try:
            cursor.execute("SELECT role, content FROM user_chat_messages ORDER BY id")
            chat_rows = cursor.fetchall()
            chat_history = [{"role": r["role"], "content": r["content"]} for r in chat_rows]
        except Exception:
            try:
                # If table doesn't exist, create it to prevent future query failures
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS user_chat_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at REAL NOT NULL
                    )
                """)
                conn.commit()
            except Exception:
                pass
            chat_history = []

        conn.close()

        runner = get_runner(name)

        return {
            "project_name": name,
            "is_running": runner.is_running,
            "config": config,
            "agents": agents,
            "teams": teams,
            "agreements": agreements,
            "libraries": libraries,
            "chat_history": chat_history
        }
    except Exception as e:
        logger.error(f"Error querying state for {name}: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {e}")

@app.get("/api/projects/{name}/files/{lib_id}")
async def get_library_file(name: str, lib_id: str, path: str):
    """Reads a file's contents from the database or workspace disk."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT content FROM doc_lib_files WHERE lib_id=? AND path=?", (lib_id, path))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"File '{path}' not found in library '{lib_id}'.")
            
        return {"lib_id": lib_id, "path": path, "content": row[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{name}/files")
async def write_library_file(name: str, data: FileWrite):
    """Writes content to a document library, updating database and disk."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")

    try:
        # Write physically to local disk under .att_doc_libs
        target_dir = os.path.abspath(os.path.join(".att_doc_libs", data.lib_id))
        os.makedirs(target_dir, exist_ok=True)
        
        # Prevent traversal
        clean_path = data.path.lstrip("/").replace("\\", "/")
        full_path = os.path.abspath(os.path.join(target_dir, clean_path))
        if not full_path.startswith(target_dir):
            raise HTTPException(status_code=403, detail="Path traversal blocked.")

        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(data.content)

        # Sync to SQLite DB
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO doc_lib_files (lib_id, path, content) VALUES (?, ?, ?)",
            (data.lib_id, clean_path, data.content)
        )
        conn.commit()
        conn.close()

        # Broadcast file change event
        await broadcaster.broadcast({
            "project_id": name,
            "type": "file_change",
            "data": {"lib_id": data.lib_id, "path": clean_path, "action": "write"}
        })

        return {"status": "success", "path": clean_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{name}/files/{lib_id}")
async def delete_library_file(name: str, lib_id: str, path: str):
    """Deletes a file from database and disk."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")

    try:
        # Delete physically from local disk
        target_dir = os.path.abspath(os.path.join(".att_doc_libs", lib_id))
        clean_path = path.lstrip("/").replace("\\", "/")
        full_path = os.path.abspath(os.path.join(target_dir, clean_path))
        
        if full_path.startswith(target_dir) and os.path.exists(full_path):
            if os.path.isdir(full_path):
                import shutil
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)

        # Delete from SQLite DB
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM doc_lib_files WHERE lib_id=? AND path=?", (lib_id, clean_path))
        conn.commit()
        conn.close()

        # Broadcast file delete event
        await broadcaster.broadcast({
            "project_id": name,
            "type": "file_change",
            "data": {"lib_id": lib_id, "path": clean_path, "action": "delete"}
        })

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{name}/proposals/{id}/resolve")
async def resolve_proposal(name: str, id: str, data: dict):
    """Administratively resolves an active proposal (Approve/Reject)."""
    db_path = os.path.join(DB_DIR, f"{name}.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Project database not found.")
    
    approved = data.get("approved", True)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT action, target, proposed_details, team_id FROM team_proposals WHERE proposal_id=?", (id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Proposal not found.")
            
        action, target, proposed_details_str, team_id = row
        
        status = "approved" if approved else "rejected"
        cursor.execute("UPDATE team_proposals SET status=? WHERE proposal_id=?", (status, id))
        
        if approved:
            if action == "add":
                p_details = json.loads(proposed_details_str) if proposed_details_str else {}
                role_name = target
                agent_name = f"Dynamic_{role_name}"
                
                cursor.execute("INSERT OR IGNORE INTO agents (name, role, role_description, system_instructions) VALUES (?, ?, ?, ?)",
                               (agent_name, role_name, p_details.get("role_description", ""), p_details.get("system_instructions", "")))
                cursor.execute("INSERT OR IGNORE INTO team_members (team_id, agent_name) VALUES (?, ?)", (team_id, agent_name))
            elif action == "remove":
                agent_name = target
                cursor.execute("DELETE FROM team_members WHERE team_id=? AND agent_name=?", (team_id, agent_name))
                
        conn.commit()
        conn.close()
        
        # Broadcast proposal status change
        await broadcaster.broadcast({
            "project_id": name,
            "type": "proposal_change",
            "data": {"proposal_id": id, "status": status}
        })
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/{project_name}")
async def websocket_endpoint(websocket: WebSocket, project_name: str):
    """Establishes real-time connection to stream agent actions and state."""
    await websocket.accept()
    broadcaster.register(websocket)
    logger.info(f"WebSocket client connected to project: {project_name}")
    try:
        while True:
            # Keep connection alive, listen for any client messages
            data = await websocket.receive_text()
            # Echo or process if needed. For now, it's just a keep-alive listener.
    except WebSocketDisconnect:
        broadcaster.unregister(websocket)
# Mount frontend/dist if it exists (production build), otherwise serve a friendly guide
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/")
    async def root_guide():
        return {
            "message": "ATT-UI API Server is running.",
            "frontend_dev_url": "http://localhost:5173",
            "instruction": "Please open a new terminal, run 'npm run frontend', and visit http://localhost:5173 to open the Workspace GUI."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
