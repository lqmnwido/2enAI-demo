# Project requirements

- Use local Qwen models through vLLM for all inference, as explicitly requested by the user.
- ASR uses Qwen3ASRModel.LLM streaming; chat uses vLLM; TTS uses vLLM-Omni.
- Do not silently substitute hosted services, browser speech synthesis, or another inference engine.
- The robot reference is `C:/Users/Wido/Downloads/Cute Robot Orthographic Turntable.png`.
- Keep the Blender source, exported GLB, and React model consistent. Inspect renders after geometry changes.
