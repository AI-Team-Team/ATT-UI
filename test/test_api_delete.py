import os
import shutil
import sqlite3
import httpx
import time
import subprocess
import socket
import unittest

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_DIR = os.path.join(WORKSPACE_DIR, "backend", "db")
PROJECT_NAME = "api_test_project"
DB_PATH = os.path.join(DB_DIR, f"{PROJECT_NAME}.db")

def wait_for_port(port: int, timeout: float = 10.0) -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1.0):
                return True
        except (socket.timeout, ConnectionRefusedError):
            time.sleep(0.5)
    return False

class TestApiDelete(unittest.TestCase):
    def setUp(self):
        self.cleanup_residual()
        self.create_fake_db()

    def tearDown(self):
        self.cleanup_residual()

    def cleanup_residual(self):
        if os.path.exists(DB_PATH):
            try:
                os.remove(DB_PATH)
            except:
                pass
        lib_dir = os.path.join(WORKSPACE_DIR, "backend", ".att_doc_libs", "DL-test-api")
        if os.path.exists(lib_dir):
            try:
                shutil.rmtree(lib_dir)
            except:
                pass

    def create_fake_db(self):
        os.makedirs(DB_DIR, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE manager_config (config_key TEXT, config_value TEXT)")
        cursor.execute("CREATE TABLE teams (team_id TEXT, preset_name TEXT, team_purpose TEXT, team_progress TEXT, depth INTEGER, chapter_num INTEGER, parent_team_id TEXT, migration_count INTEGER, creator_type TEXT, creator_id TEXT, communication_rules TEXT, status_map TEXT, system_instructions TEXT)")
        cursor.execute("CREATE TABLE agents (name TEXT, role TEXT, role_description TEXT, system_instructions TEXT, model_alias TEXT, last_context TEXT)")
        cursor.execute("CREATE TABLE libraries (lib_id TEXT, name TEXT, owner_team_id TEXT, description TEXT, is_public_visible INTEGER)")
        cursor.execute("CREATE TABLE doc_lib_files (lib_id TEXT, path TEXT, content TEXT)")
        cursor.execute("INSERT INTO libraries (lib_id, name) VALUES ('DL-test-api', 'Test Lib')")
        cursor.execute("INSERT INTO doc_lib_files (lib_id, path, content) VALUES ('DL-test-api', 'hello.txt', 'hello world')")
        cursor.execute("INSERT INTO manager_config (config_key, config_value) VALUES ('att_config', '{}')")
        conn.commit()
        conn.close()
        
        target_dir = os.path.abspath(os.path.join(WORKSPACE_DIR, "backend", ".att_doc_libs", "DL-test-api"))
        os.makedirs(target_dir, exist_ok=True)
        with open(os.path.join(target_dir, "hello.txt"), "w") as f:
            f.write("hello world")

    def test_project_deletion_api(self):
        python_executable = os.path.join(WORKSPACE_DIR, "backend", "venv", "bin", "python")
        server_process = subprocess.Popen(
            [python_executable, "app.py"],
            cwd=os.path.join(WORKSPACE_DIR, "backend"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        port_open = wait_for_port(8000, 10.0)
        self.assertTrue(port_open, "Server failed to start on port 8000")
        
        try:
            with httpx.Client(base_url="http://127.0.0.1:8000", timeout=20.0) as client:
                res = client.get("/api/projects")
                self.assertEqual(res.status_code, 200)
                
                projects = res.json()
                project_names = [p["name"] for p in projects]
                self.assertIn(PROJECT_NAME, project_names)
                
                res_del = client.delete(f"/api/projects/{PROJECT_NAME}")
                self.assertEqual(res_del.status_code, 200)
                
                self.assertFalse(os.path.exists(DB_PATH), "Database file was not deleted")
                target_dir = os.path.abspath(os.path.join(WORKSPACE_DIR, "backend", ".att_doc_libs", "DL-test-api"))
                self.assertFalse(os.path.exists(target_dir), "Physical documents library was not deleted")
        finally:
            server_process.terminate()
            server_process.wait()

if __name__ == "__main__":
    unittest.main()
