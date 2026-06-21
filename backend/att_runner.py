import asyncio
import json
import logging
import re
import os
import sqlite3
import time
from typing import Dict, Any, List, Optional
from ai_team_team import ATTManager, Agent, ATTConfig, DocumentLibrary

logger = logging.getLogger("ATT-UI.Runner")

def save_chat_message(db_path: str, role: str, content: str):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at REAL NOT NULL
            )
        """)
        cursor.execute(
            "INSERT INTO user_chat_messages (role, content, created_at) VALUES (?, ?, ?)",
            (role, content, time.time())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving chat message to {db_path}: {e}")

class WebSocketBroadcaster:
    """Manages active WebSocket connections for real-time broadcasts."""
    def __init__(self):
        self.active_connections = set()

    def register(self, websocket):
        self.active_connections.add(websocket)

    def unregister(self, websocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.remove(connection)

broadcaster = WebSocketBroadcaster()

import yaml

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def load_yaml_with_env(filepath: str) -> dict:
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Resolve environment variables like ${ENV_VAR}
        pattern = re.compile(r"\$\{(\w+)\}")
        def replacer(match):
            env_var = match.group(1)
            return os.environ.get(env_var, "")
        
        resolved_content = pattern.sub(replacer, content)
        return yaml.safe_load(resolved_content) or {}
    except Exception as e:
        logger.error(f"Error loading/parsing YAML at {filepath}: {e}")
        return {}

def is_model_runnable(profile: dict) -> bool:
    api_key = profile.get("api_key", "")
    base_url = profile.get("base_url", "")
    
    # If it is a local endpoint, we assume it doesn't need an API key to be set
    if "localhost" in base_url or "127.0.0.1" in base_url or "::1" in base_url:
        return True
        
    # Otherwise, it needs a valid non-empty API key
    if not api_key:
        return False
        
    return True

def get_active_model_config() -> Optional[dict]:
    ai_model_config_path = os.path.join(WORKSPACE_DIR, "ai_model_config.yaml")
    models = load_yaml_with_env(ai_model_config_path)
    if not models:
        return None
    for key, val in models.items():
        if isinstance(val, dict) and val.get("enabled") is True:
            if is_model_runnable(val):
                val["profile_name"] = key
                return val
            else:
                logger.warning(f"Model profile '{key}' is enabled but has no valid API key or endpoint. Skipping.")
    return None

async def call_real_llm(
    config: dict,
    prompt: Any,
    system_instruction: Optional[str] = None,
    temperature: float = 0.3,
    require_json: bool = False
) -> str:
    api_type = config.get("api_type", "gemini").lower()
    api_key = config.get("api_key", "")
    model_name = config.get("model_name", "") or "local-model"
    base_url = config.get("base_url", "")

    prompt_list = []
    if isinstance(prompt, list):
        prompt_list = prompt
    else:
        prompt_list = [{"role": "user", "content": str(prompt)}]

    if api_type == "gemini":
        if genai is None:
            raise ImportError("google-genai SDK is not installed.")
        
        try:
            http_options = None
            if base_url:
                http_options = types.HttpOptions(base_url=base_url)
                
            client = genai.Client(api_key=api_key if api_key else None, http_options=http_options)
        except Exception as e:
            logger.error(f"Failed to initialize Gemini Client: {e}")
            raise RuntimeError(f"Error initializing Gemini Client: {e}") from e
        
        contents = []
        for turn in prompt_list:
            role = "model" if turn["role"] == "assistant" else "user"
            contents.append({
                "role": role,
                "parts": [{"text": turn["content"]}]
            })

        config_params = {}
        if temperature is not None:
            config_params["temperature"] = temperature
        if require_json:
            config_params["response_mime_type"] = "application/json"
        if system_instruction:
            config_params["system_instruction"] = system_instruction

        gen_config = types.GenerateContentConfig(**config_params)

        try:
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=gen_config
            )
            return response.text or ""
        except Exception as e:
            logger.error(f"Gemini API Exception: {e}")
            raise RuntimeError(f"Gemini API Request Error: {e}") from e

    elif api_type == "openai":
        if AsyncOpenAI is None:
            raise ImportError("openai SDK is not installed.")
            
        try:
            client = AsyncOpenAI(
                api_key=api_key if api_key else "dummy-key",
                base_url=base_url if base_url else None
            )
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI Client: {e}")
            raise RuntimeError(f"Error initializing OpenAI Client: {e}") from e

        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        for turn in prompt_list:
            messages.append({"role": turn["role"], "content": turn["content"]})

        response_format = {"type": "json_object"} if require_json else None

        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                response_format=response_format
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"OpenAI API Exception: {e}")
            raise RuntimeError(f"OpenAI API Request Error: {e}") from e

    raise ValueError("Invalid API provider configuration.")

# Simulated database responses and agent logic
async def simulate_generator_handler(
    model_name: str,
    prompt: Any,
    system_instruction: Optional[str] = None,
    temperature: float = 0.3,
    require_json: bool = False
) -> str:
    """
    Decides whether to run simulated mock outputs or call live API endpoints
    based on config files.
    """
    active_config = get_active_model_config()
    
    if active_config is not None:
        return await call_real_llm(
            config=active_config,
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=temperature,
            require_json=require_json
        )

    await asyncio.sleep(0.8) # Add realistic thinking latency

    # Convert prompt to string representation for general metadata extraction
    prompt_str = ""
    if isinstance(prompt, list):
        prompt_str = "\n".join([str(msg.get("content", "")) for msg in prompt])
    else:
        prompt_str = str(prompt)
    
    prompt_str_lower = prompt_str.lower()

    if require_json:
        # 1. Dialogue Integrity & Deadlock Auditor Consensus
        if "integrity_auditor" in str(system_instruction).lower() or "continuity_auditor" in str(system_instruction).lower() or "deadlock_auditor" in str(system_instruction).lower():
            return json.dumps({
                "is_healthy": True,
                "reason": "Dialogue progresses logically. Code files and documents are aligned."
            })
        
        # 2. Inter-team communication rule approval
        if "evaluate peer communication" in prompt_str_lower:
            return json.dumps({
                "approved": True,
                "reason": "Cross-lineage collaboration requested is aligned with project objectives."
            })
            
        # 3. Lineage restructing approval
        if "evaluate restructure proposal" in prompt_str_lower or "migration rationale" in prompt_str_lower:
            return json.dumps({
                "approved": True,
                "reason": "Approved: Migration will improve file access speed and collaboration efficiency."
            })
            
        return json.dumps({"approved": True, "is_healthy": True, "reason": "Simulated successful JSON response."})

    # Determine if we are responding to an observation from a just-executed tool call.
    is_after_observation = False
    last_observation = ""
    
    if isinstance(prompt, list) and len(prompt) > 0:
        last_msg = prompt[-1]
        last_content = last_msg.get("content", "")
        if "observation:" in last_content.lower():
            is_after_observation = True
            last_observation = last_content
    elif "observation:" in prompt_str_lower:
        is_after_observation = True
        obs_match = re.search(r"observation:\s*(.*)", prompt_str, re.IGNORECASE | re.DOTALL)
        if obs_match:
            last_observation = obs_match.group(1).strip()

    # Determine DL ID to write files to
    dl_id = "DL-AT-default"
    dl_match = re.search(r"(DL-[a-fA-F0-9]+)", prompt_str)
    if dl_match:
        dl_id = dl_match.group(1)

    # Check user commands
    wants_write = any(w in prompt_str_lower for w in ["write", "create", "generate", "summarize"])
    wants_read = any(r in prompt_str_lower for r in ["read", "view", "open", "parse"])
    wants_migrate = any(m in prompt_str_lower for m in ["migrate", "migration"])

    if not is_after_observation:
        if wants_read:
            filename = "notes.txt"
            file_match = re.search(r"(\w+\.\w+)", prompt_str)
            if file_match:
                filename = file_match.group(1)
            return (
                f"Thought: I need to inspect the contents of '{filename}' in the document library to fulfill the request.\n"
                f"Action: read_library_file(lib_id=\"{dl_id}\", path=\"{filename}\")"
            )
            
        elif wants_write:
            filename = "report.md"
            file_match = re.search(r"(\w+\.md|\w+\.txt|\w+\.py)", prompt_str)
            if file_match:
                filename = file_match.group(1)
            content = "### Project Artifact Summary\nGenerated by ATT-UI Workspace agents.\n- Status: Completed\n- Quality: Verified"
            return (
                f"Thought: I will write the generated summary and report contents to the document library.\n"
                f"Action: write_library_file(lib_id=\"{dl_id}\", path=\"{filename}\", content=\"{content}\")"
            )
            
        elif wants_migrate:
            target_team = "AT-target"
            target_match = re.search(r"(AT-[a-fA-F0-9]+)", prompt_str)
            if target_match:
                target_team = target_match.group(1)
            return (
                f"Thought: I should migrate our team to parent '{target_team}' for better structural alignment.\n"
                f"Action: request_migration(target_parent_id=\"{target_team}\", rationale=\"Optimize communication path\")"
            )
            
        else:
            return (
                f"Thought: I will collaborate with the team on this request.\n"
                f"Final Answer: Let's initiate the project structure. I'm ready to write code or read specs as needed."
            )
    else:
        if "error" in last_observation.lower():
            return f"Thought: The action encountered an error: {last_observation}. I will inform the user.\nFinal Answer: I encountered an error performing the action: {last_observation}"
        return f"Thought: The action completed successfully with observation: {last_observation}.\nFinal Answer: I have successfully completed the requested operation. The files are updated."


class ATTRunner:
    """Manages the lifecycle of an ATT execution session for a project."""
    def __init__(self, project_id: str, db_path: str, workspace_dir: str):
        self.project_id = project_id
        self.db_path = db_path
        self.workspace_dir = workspace_dir
        self.manager: Optional[ATTManager] = None
        self.is_running = False
        self.agent_statuses = {}

    def setup_manager(self) -> ATTManager:
        """Initializes or loads the ATTManager for the project workspace."""
        config_path = os.path.join(self.workspace_dir, "config.yaml")
        yaml_config = load_yaml_with_env(config_path)
        
        autonomy_opts = yaml_config.get("autonomy", {})
        
        enable_dynamic_delegation = autonomy_opts.get("enable_dynamic_delegation", True)
        max_delegation_depth = autonomy_opts.get("max_delegation_depth", 2)
        min_subagent_team_size = autonomy_opts.get("min_subagent_team_size", 3)
        subagent_discussion_rounds = autonomy_opts.get("subagent_discussion_rounds", 2)
        react_max_steps = autonomy_opts.get("react_max_steps", 5)
        inbox_summarize_threshold_chars = autonomy_opts.get("inbox_summarize_threshold_chars", 1500)

        config = ATTConfig(
            enable_dynamic_delegation=enable_dynamic_delegation,
            max_delegation_depth=max_delegation_depth,
            min_subagent_team_size=min_subagent_team_size,
            subagent_discussion_rounds=subagent_discussion_rounds,
            react_max_steps=react_max_steps,
            inbox_summarize_threshold_chars=inbox_summarize_threshold_chars,
            enable_membership_voting=True
        )

        root_agent = Agent(name="Root_AI", role="Architect")
        
        # Instantiate manager pointing to project DB
        self.manager = ATTManager(
            root_ai=root_agent,
            config=config,
            db_path=self.db_path
        )

        # Register generator handler for simulation/execution
        self.manager.register_generator_handler(simulate_generator_handler)
        
        # Bind tools context
        self.manager.register_tools_context({"att_manager": self.manager})

        # Bind WebSocket broadcast hooks
        self._bind_callbacks()

        # If database exists, restore the last state
        if os.path.exists(self.db_path):
            try:
                self.manager.load_state(self.db_path)
                logger.info(f"Successfully loaded existing state for project {self.project_id}")
            except Exception as e:
                logger.error(f"Error loading state for project {self.project_id}: {e}")

        return self.manager

    def _bind_callbacks(self):
        """Binds ATTManager events to broadcast WebSocket packets."""
        if not self.manager:
            return

        def make_callback(event_type: str):
            def callback(*args):
                data = {}
                if event_type == "status_change":
                    agent_name = args[0]
                    status = args[1]
                    self.agent_statuses[agent_name] = status
                    data = {"agent_name": agent_name, "status": status}
                elif event_type == "activity_added":
                    data = {"agent_name": args[0], "activity_type": args[1], "content": args[2]}
                elif event_type == "log_append":
                    data = {"team_id": args[0], "title": args[1], "content": args[2], "chapter_num": args[3]}
                elif event_type == "team_migration":
                    data = {"team_id": args[0], "old_parent_id": args[1], "new_parent_id": args[2]}
                elif event_type == "emergency_escalation":
                    data = {"team_id": args[0], "alert_type": args[1], "alert_reason": args[2]}

                event = {
                    "project_id": self.project_id,
                    "type": event_type,
                    "data": data
                }

                # Schedule the broadcast in the running event loop
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(broadcaster.broadcast(event))
                except Exception as e:
                    pass
            return callback

        self.manager.on_status_change = make_callback("status_change")
        self.manager.on_activity_added = make_callback("activity_added")
        self.manager.on_log_append = make_callback("log_append")
        self.manager.on_team_migration = make_callback("team_migration")
        self.manager.on_emergency_escalation = make_callback("emergency_escalation")

    async def run_task(self, prompt: str) -> str:
        """Runs the active team discussion for a project in a non-blocking task."""
        if self.is_running:
            return "Error: A discussion is already active for this project."

        self.is_running = True
        try:
            self.setup_manager()
            
            # Save the user prompt to chat history
            save_chat_message(self.db_path, "user", prompt)

            # Broadcast session start
            await broadcaster.broadcast({
                "project_id": self.project_id,
                "type": "session_start",
                "data": {"prompt": prompt}
            })

            # Check if we have spawned any teams yet. If not, spawn the Level 1 default team first
            if not self.manager.teams:
                # Spawn a generic Level 1 team to start the discussion
                min_size = self.manager.config.min_subagent_team_size
                team = self.manager.create_agent_team(
                    creator=self.manager.root_ai,
                    member_count=max(3, min_size),
                    preset_name="generic",
                    team_purpose="Execute workspace user requests"
                )
            else:
                # Find any active top-level team
                team = next(t for t in self.manager.teams.values() if t.parent_team is None)

            # Run debate
            transcript = await self.manager.execute_team_discussion(
                team=team,
                prompt=prompt,
                rounds=1
            )

            # Save the team response to chat history
            save_chat_message(self.db_path, "assistant", transcript)

            # Broadcast session end
            await broadcaster.broadcast({
                "project_id": self.project_id,
                "type": "session_end",
                "data": {"transcript": transcript}
            })

            return transcript
        except Exception as e:
            logger.error(f"Error executing run_task for {self.project_id}: {e}")
            # Save error message to chat history so the user sees it in the chat box
            save_chat_message(self.db_path, "assistant", f"⚠️ Error: ATT failed to complete the task. Reason: {e}")
            await broadcaster.broadcast({
                "project_id": self.project_id,
                "type": "session_end",
                "data": {"error": str(e)}
            })
            raise e
        finally:
            self.is_running = False
            for k in list(self.agent_statuses.keys()):
                self.agent_statuses[k] = "Idle"
