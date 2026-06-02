from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer, Boolean, Float
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./living_canvas.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    google_access_token = Column(Text)
    google_refresh_token = Column(Text)
    google_token_expiry = Column(DateTime)
    created_at = Column(DateTime)


class Layout(Base):
    __tablename__ = "layouts"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    widgets_json = Column(Text)
    background_json = Column(Text)
    sidebar_open = Column(Boolean, default=True)
    updated_at = Column(DateTime)


class WidgetCache(Base):
    __tablename__ = "widget_cache"
    id = Column(String, primary_key=True, index=True)
    widget_id = Column(String, index=True)
    user_id = Column(String, index=True)
    data_json = Column(Text)
    fetched_at = Column(DateTime)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
