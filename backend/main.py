import asyncio
import json
import time
from datetime import datetime
from typing import List, Optional
import serial
import serial.tools.list_ports
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionRequest(BaseModel):
    port: str
    baudrate: int = 115200

class HardwareState:
    def __init__(self):
        self.serial_conn: Optional[serial.Serial] = None
        self.port: Optional[str] = None
        self.baudrate: int = 115200
        self.connected: bool = False
        self.last_packet_time: float = 0
        self.latest_data: dict = self.default_payload()
        self.clients: List[WebSocket] = []

    def default_payload(self):
        return {
            "esp32_connected": False,
            "gps_connected": False,
            "gps_valid": False,
            "mpu_connected": False,
            "latitude": 28.6139,
            "longitude": 77.2090,
            "speed_kmh": 0.0,
            "satellites": 0,
            "activity": "UNKNOWN",
            "acceleration": {"x": 0.0, "y": 0.0, "z": 0.0},
            "timestamp": datetime.now().isoformat(),
        }

state = HardwareState()

@app.get("/api/ports")
def get_serial_ports():
    ports = serial.tools.list_ports.comports()
    return [{"device": p.device, "description": p.description} for p in ports]

@app.post("/api/connect")
def connect_serial(req: ConnectionRequest):
    if state.serial_conn and state.serial_conn.is_open:
        state.serial_conn.close()
    try:
        state.serial_conn = serial.Serial(req.port, req.baudrate, timeout=1)
        state.port = req.port
        state.baudrate = req.baudrate
        state.connected = True
        return {"status": "connected", "port": req.port}
    except Exception as e:
        state.connected = False
        return {"status": "error", "message": str(e)}

@app.post("/api/disconnect")
def disconnect_serial():
    if state.serial_conn and state.serial_conn.is_open:
        state.serial_conn.close()
    state.connected = False
    state.latest_data = state.default_payload()
    return {"status": "disconnected"}

async def broadcast(message: dict):
    for client in list(state.clients):
        try:
            await client.send_json(message)
        except Exception:
            state.clients.remove(client)

async def serial_reader_loop():
    while True:
        if state.connected and state.serial_conn:
            try:
                if state.serial_conn.in_waiting > 0:
                    raw_line = state.serial_conn.readline().decode("utf-8", errors="ignore").strip()
                    if raw_line.startswith("{") and raw_line.endswith("}"):
                        parsed = json.loads(raw_line)
                        parsed["esp32_connected"] = True
                        parsed["timestamp"] = datetime.now().isoformat()
                        state.latest_data = parsed
                        state.last_packet_time = time.time()
                        await broadcast(state.latest_data)
            except (serial.SerialException, OSError):
                state.connected = False
                state.latest_data = state.default_payload()
                await broadcast(state.latest_data)
            except json.JSONDecodeError:
                pass
        
        if state.connected and (time.time() - state.last_packet_time > 4.0) and state.last_packet_time != 0:
            state.latest_data["gps_valid"] = False
            await broadcast(state.latest_data)

        await asyncio.sleep(0.05)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(serial_reader_loop())

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.clients.append(websocket)
    await websocket.send_json(state.latest_data)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        state.clients.remove(websocket)