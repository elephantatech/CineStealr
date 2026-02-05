from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
from database import Base

class ImageRecord(Base):
    __tablename__ = "image_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String)
    media_type = Column(String, default="image") # 'image' or 'movie'
    tags = Column(String)  # Comma separated list of detected objects
    description = Column(Text)
    image_prompt = Column(Text)  # AI-friendly prompt for image generation
    created_at = Column(DateTime, default=datetime.utcnow)

class Settings(Base):
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True, index=True)
    value = Column(String)
