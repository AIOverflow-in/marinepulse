from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017/marinepulse"
    jwt_secret: str = "marinepulse-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    openai_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
