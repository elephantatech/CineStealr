from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import shutil
import os
import uuid
import logging

import models, database, vision, llm_client, logging_config
from database import engine, get_db

# Initialize database
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Scene Stealer API")

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
logger = logging.getLogger("scene_stealer.api")

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
    
    # Convert web path to local file path
    # DB has "/uploads/xyz.jpg", we need "uploads/xyz.jpg" relative to workdir
    relative_path = record.file_path.lstrip("/")
    
    async def event_generator():
        full_description = ""
        try:
            # Pass image path to LLaVA
            for chunk in llm_service.generate_description_stream(relative_path, record.media_type):
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

@app.get("/records")
def list_records(db: Session = Depends(get_db)):
    return db.query(models.ImageRecord).order_by(models.ImageRecord.created_at.desc()).all()

@app.get("/record/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record

@app.get("/generate-prompt/{record_id}")
async def generate_image_prompt(record_id: int, db: Session = Depends(get_db)):
    """Generate an AI image generation prompt from the scene description."""
    record = db.query(models.ImageRecord).filter(models.ImageRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    if not record.description:
        raise HTTPException(status_code=400, detail="No description available. Generate description first.")
    
    async def event_generator():
        full_prompt = ""
        try:
            for chunk in llm_service.generate_image_prompt_stream(record.description, record.tags):
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

@app.get("/health")
def health_check():
    return {"status": "healthy"}
