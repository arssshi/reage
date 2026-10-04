from typing import Literal

from pydantic import BaseModel, Field


class TextEdit(BaseModel):
    span_id: str = Field(max_length=80)
    text: str = Field(max_length=4000)
    font: str = Field(default="original", max_length=80, pattern=r"^(original|auto|[a-z]+|(?:builtin|font|script|mix):[A-Za-z0-9]+)$")
    size: float | None = Field(default=None, ge=1, le=300)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    fit: bool = False
    background: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class EditRequest(BaseModel):
    edits: list[TextEdit] = Field(default_factory=list, max_length=1000)


class RenderRequest(EditRequest):
    scale: float = Field(default=1.5, ge=0.15, le=6)


class FontFetchRequest(BaseModel):
    family: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9 .-]+$")
    weight: Literal[400, 700] = 400
    italic: bool = False


class FontProbeRequest(BaseModel):
    span_id: str
    text: str = Field(max_length=4000)
    font: str = "auto"


class OCRLine(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    bbox: tuple[float, float, float, float]
    baseline: float | None = None
    confidence: float = Field(ge=0, le=100)


class OCRRequest(BaseModel):
    lines: list[OCRLine] = Field(max_length=1500)
    language: str = Field(max_length=30)


class RegionRequest(BaseModel):
    bbox: tuple[float, float, float, float]
