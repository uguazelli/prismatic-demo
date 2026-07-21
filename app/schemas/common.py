from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field


class ApiSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Page(ApiSchema, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)


class Message(ApiSchema):
    message: str
