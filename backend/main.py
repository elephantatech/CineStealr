from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import shutil
import os
import uuid
import logging
import base64
from datetime import datetime, timedelta

import models, database, vision, llm_client, logging_config
from database import engine, get_db

# Initialize database
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Scene Stealer API")

logger = logging.getLogger("scene_stealer.api")

# Helper for API Key Encoding
def encode_key(key: str) -> str:
    if not key: return ""
    return base64.b64encode(key.encode()).decode()

def decode_key(encoded_key: str) -> str:
    if not encoded_key: return ""
    try:
        return base64.b64decode(encoded_key.encode()).decode()
    except:
        return encoded_key # Fallback if not encoded

def enforce_retention_policy(db: Session):
    """Delete records older than the retention period."""
    try:
        retention_setting = db.query(models.Settings).filter(models.Settings.key == "history_retention_days").first()
        if not retention_setting or not retention_setting.value:
            return
        
        days = int(retention_setting.value)
        if days <= 0:
            return # 0 or negative means keep forever/disabled
            
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Find old records
        old_records = db.query(models.ImageRecord).filter(models.ImageRecord.created_at < cutoff_date).all()
        count = len(old_records)
        
        if count > 0:
            logger.info(f"Retention policy: Deleting {count} records older than {days} days.")
            for record in old_records:
                try:
                    relative_path = record.file_path.lstrip("/")
                    if os.path.exists(relative_path):
                        os.remove(relative_path)
                except Exception as e:
                    logger.error(f"Failed to delete file {record.file_path}: {e}")
            
            db.query(models.ImageRecord).filter(models.ImageRecord.created_at < cutoff_date).delete()
            db.commit()
    except Exception as e:
        logger.error(f"Error enforcing retention policy: {e}")

@app.on_event("startup")
def startup_event():
    # create a new session just for this check
    db = database.SessionLocal()
    try:
        enforce_retention_policy(db)
        
        # Check if settings are already initialized
        existing_url = db.query(models.Settings).filter(models.Settings.key == "llm_api_url").first()
        
        if not existing_url:
            init_provider = os.getenv("INIT_LLM_PROVIDER", "local").lower()
            init_key = os.getenv("INIT_LLM_API_KEY", "")
            init_model = os.getenv("INIT_LLM_MODEL", "")
            
            # Default URLs based on provider
            provider_urls = {
                "openai": "https://api.openai.com/v1/chat/completions",
                "ollama": "http://host.containers.internal:11434/v1/chat/completions",
                "llama_cpp": "http://host.containers.internal:8080/v1/chat/completions",
                "local": "http://host.containers.internal:8080/v1/chat/completions" # Default fallback (Native Mac)
            }
            
            # Override URL if manually set via INIT_LLM_URL
            target_url = os.getenv("INIT_LLM_URL", provider_urls.get(init_provider, provider_urls["local"]))
            
            logger.info(f"Initializing Backend with Provider: {init_provider}")
            
            # 1. Set URL
            db.add(models.Settings(key="llm_api_url", value=target_url))
            
            # 2. Set Key (Encoded)
            if init_key:
                db.add(models.Settings(key="llm_api_key", value=encode_key(init_key)))
                
            # 3. Set Model
            if init_model:
                db.add(models.Settings(key="llm_model_name", value=init_model))
                
            db.commit()
            logger.info(f"Initialized Settings - URL: {target_url}, Model: {init_model}")
            
    finally:
        db.close()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

vision_service = vision.VisionService()
llm_service = llm_client.LLMService()

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...), 
    media_type: str = Form("image"),
    db: Session = Depends(get_db)
):
    try:
        # 1. Save File
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 2. Vision Detection
        tags = vision_service.detect_objects(file_path)
        
        # 3. Create Initial DB Record
        new_record = models.ImageRecord(
            filename=file.filename,
            file_path=f"/uploads/{unique_filename}",
            media_type=media_type,
            tags=",".join(tags),
            description="" 
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        return new_record
    except Exception as e:
        logging_config.send_alert(f"Failed to process upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/stream/{record_id}")
async def stream_description(record_id: int, db: Session = Depends(get_db)):
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Fetch API Settings
    settings_url = db.query(models.Settings).filter(models.Settings.key == "llm_api_url").first()
    settings_key = db.query(models.Settings).filter(models.Settings.key == "llm_api_key").first()
    settings_model = db.query(models.Settings).filter(models.Settings.key == "llm_model_name").first()
    
    api_url = settings_url.value if settings_url else None
    
    # Decode Key
    api_key = decode_key(settings_key.value) if settings_key else None
    model_name = settings_model.value if settings_model else None
    
    relative_path = record.file_path.lstrip("/")
    
    async def event_generator():
        full_description = ""
        try:
            # Pass settings to LLaVA
            async for chunk in llm_service.generate_description_stream(
                relative_path, 
                record.media_type, 
                api_url=api_url,
                api_key=api_key,
                model_name=model_name
            ):
                if chunk:
                    full_description += chunk
                    yield f"data: {chunk}\n\n"
            
            # Save final description to DB
            record.description = full_description.strip()
            db.commit()
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/generate-prompt/{record_id}")
async def generate_image_prompt(record_id: int, db: Session = Depends(get_db)):
    """Generate an AI image generation prompt from the scene description."""
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    if not record.description:
        raise HTTPException(status_code=400, detail="No description available. Generate description first.")
    
    # Fetch API Settings
    settings_url = db.query(models.Settings).filter(models.Settings.key == "llm_api_url").first()
    settings_key = db.query(models.Settings).filter(models.Settings.key == "llm_api_key").first()
    settings_model = db.query(models.Settings).filter(models.Settings.key == "llm_model_name").first()
    
    api_url = settings_url.value if settings_url else None
    # Decode Key
    api_key = decode_key(settings_key.value) if settings_key else None
    model_name = settings_model.value if settings_model else None
    
    async def event_generator():
        full_prompt = ""
        try:
            for chunk in llm_service.generate_image_prompt_stream(
                record.description, 
                record.tags, 
                api_url=api_url,
                api_key=api_key,
                model_name=model_name
            ):
                if chunk:
                    full_prompt += chunk
                    yield f"data: {chunk}\n\n"
            
            # Save final prompt to DB
            record.image_prompt = full_prompt.strip()
            db.commit()
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Prompt generation failed: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/record/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    """Fetch a single record by ID."""
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record

@app.delete("/record/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    try:
        relative_path = record.file_path.lstrip("/")
        if os.path.exists(relative_path):
            os.remove(relative_path)
    except Exception as e:
        logger.error(f"Failed to delete file {record.file_path}: {e}")
    
    db.delete(record)
    db.commit()
    return {"status": "success", "message": "Record deleted"}

@app.get("/records")
def get_records(db: Session = Depends(get_db)):
    """Fetch all history records."""
    records = db.query(models.ImageRecord).order_by(models.ImageRecord.created_at.desc()).all()
    return records

@app.delete("/records")
def clear_history(db: Session = Depends(get_db)):
    """Delete all history records and files."""
    records = db.query(models.ImageRecord).all()
    count = len(records)
    
    for record in records:
        try:
            relative_path = record.file_path.lstrip("/")
            if os.path.exists(relative_path):
                os.remove(relative_path)
        except Exception as e:
            logger.error(f"Failed to delete file {record.file_path}: {e}")
            
    db.query(models.ImageRecord).delete()
    db.commit()
    return {"status": "success", "message": f"Deleted {count} records"}

@app.get("/export")
def export_history(db: Session = Depends(get_db)):
    """Export all history as JSON."""
    records = db.query(models.ImageRecord).order_by(models.ImageRecord.created_at.desc()).all()
    export_data = []
    for r in records:
        export_data.append({
            "id": r.id,
            "filename": r.filename,
            "tags": r.tags,
            "description": r.description,
            "image_prompt": r.image_prompt,
            "created_at": r.created_at.isoformat(),
            "media_type": r.media_type
        })
    
    return export_data

from pydantic import BaseModel

class SettingUpdate(BaseModel):
    key: str
    value: str

@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(models.Settings).all()
    # Return as key-value dict, but DECODE key for frontend display
    result = {}
    for s in settings:
        if s.key == "llm_api_key":
            result[s.key] = decode_key(s.value)
        else:
            result[s.key] = s.value
    return result

@app.post("/settings")
def update_setting(setting: SettingUpdate, db: Session = Depends(get_db)):
    # If updating API key, ENCODE it
    value_to_store = setting.value
    if setting.key == "llm_api_key":
        value_to_store = encode_key(setting.value)
        
    db_setting = db.query(models.Settings).filter(models.Settings.key == setting.key).first()
    if db_setting:
        db_setting.value = value_to_store
    else:
        db_setting = models.Settings(key=setting.key, value=value_to_store)
        db.add(db_setting)
    db.commit()
    
    # If retention setting changed, enforce it immediately
    if setting.key == "history_retention_days":
        enforce_retention_policy(db)
        
    return {"status": "success", "key": setting.key, "value": setting.value}

@app.get("/proxy/models")
def get_proxy_models(db: Session = Depends(get_db)):
    """Fetch available models from the configured LLM provider."""
    # Fetch API Settings
    settings_url = db.query(models.Settings).filter(models.Settings.key == "llm_api_url").first()
    settings_key = db.query(models.Settings).filter(models.Settings.key == "llm_api_key").first()
    
    api_url = settings_url.value if settings_url else None
    
    # Decode Key
    api_key = decode_key(settings_key.value) if settings_key else None
    
    models_list = llm_service.get_models(api_url=api_url, api_key=api_key)
    return {"data": models_list}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
