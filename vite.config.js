import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3001','/asr':{target:'ws://127.0.0.1:3001',ws:true},'/assistant-stream':{target:'ws://127.0.0.1:3001',ws:true}}}});
