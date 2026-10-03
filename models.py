from pydantic import BaseModel, Field
from typing import List

class UserBase(BaseModel):
    id: str = Field(...)
    username: str = Field(..., min_length=3, max_length=15)
    password: str = Field(...)

class UserIn(BaseModel):
    username: str = Field(
        ..., 
        min_length=3,
        max_length=15)
    password: str = Field(...)

class UserOut(BaseModel):
    id: str = Field(...)
    username: str = Field(..., min_length=3, max_length=15)

class UserList(BaseModel):
    users: List[UserOut]