import sys
import os
import re
import yaml
import unittest

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def load_yaml_with_env(filepath: str) -> dict:
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        pattern = re.compile(r"\$\{(\w+)\}")
        def replacer(match):
            env_var = match.group(1)
            return os.environ.get(env_var, "")
        
        resolved_content = pattern.sub(replacer, content)
        return yaml.safe_load(resolved_content) or {}
    except Exception as e:
        return {}

class TestConfig(unittest.TestCase):
    def setUp(self):
        os.environ["GEMINI_API_KEY"] = "fake-gemini-key"
        os.environ["OPENAI_API_KEY"] = "fake-openai-key"

    def test_load_yaml_configs(self):
        config_path = os.path.join(WORKSPACE_DIR, "config.yaml")
        ai_model_config_path = os.path.join(WORKSPACE_DIR, "ai_model_config.yaml")
        
        cfg = load_yaml_with_env(config_path)
        self.assertIn("autonomy", cfg)
        
        models = load_yaml_with_env(ai_model_config_path)
        self.assertGreater(len(models), 0)
        
        for model_key, val in models.items():
            if not isinstance(val, dict):
                continue
            api_key = val.get("api_key")
            if val.get("api_type") == "gemini":
                self.assertEqual(api_key, "fake-gemini-key")

if __name__ == "__main__":
    unittest.main()
