from enum import Enum
from typing import Dict
from pydantic import BaseModel, field_validator
from fastapi import FastAPI, Path, Body


app = FastAPI()

class InsertCarModel(BaseModel):
    name: str
    model: str
    year: int

    @field_validator("year")
    @classmethod
    def car_year(cls, value):
        if value < 1970:
            raise ValueError("Car make year cant be lower than 1970!")
        return value
    
class UserModel(BaseModel):
    username: str
    age: int

    @field_validator("age")
    @classmethod
    def user_age(cls, value):
        if value < 18:
            raise ValueError("User age cant be below 18!")
        return value

class AccountType(str, Enum):
    FREE = "free"
    PRO = "pro"

@app.get("/account/{acc_type}/{months}")
async def account(acc_type: AccountType, months: int = Path(..., ge=3, le=12)):
    return {
        "message": "Account Created", "Account Type": acc_type, "months": months
    }

@app.get("/cars/price")
async def cars_by_price(min_price: int = 0, max_price: int = 10000):
    return {
        "message": f"Listing car price between {min_price} and {max_price}"
    }

@app.post("/cars")
async def new_car(data: Dict = Body(...)):
    print(data)
    return {
        "message": data
    }

@app.post("/v1/cars")
async def insert_car(data: InsertCarModel):
    return {
        "message": data
    }

@app.post("/car/user")
async def insert_car_user(carData: InsertCarModel, userData: UserModel, code: int = Body(None)):
    return {
        f"{carData = } | {userData = } | {code = }"
    }

@app.get("/")
async def index():
    return {
        "Hello": "world"
    }
