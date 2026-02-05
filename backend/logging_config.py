import logging
import logging.handlers
import os

# Create logger
logger = logging.getLogger("cinestealr")
logger.setLevel(logging.INFO)

# Formatter
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# File Handler
file_handler = logging.handlers.RotatingFileHandler(
    "cinestealr.log", maxBytes=10*1024*1024, backupCount=5
)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Stream Handler (Console)
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

# Specialized Alert Logger
alert_logger = logging.getLogger("cinestealr.alerts")
alert_logger.setLevel(logging.WARNING)

alert_file_handler = logging.handlers.RotatingFileHandler(
    "cinestealr_alerts.log", maxBytes=5*1024*1024, backupCount=3
)
alert_file_handler.setFormatter(formatter)
alert_logger.addHandler(alert_file_handler)

def get_logger(name: str):
    return logging.getLogger(f"cinestealr.{name}")

def log_alert(message: str):
    alert_logger.warning(message)