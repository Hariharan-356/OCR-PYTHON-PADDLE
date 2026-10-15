from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class JobFile(BaseModel):
    name: str
    path: str
    size: int
    mimetype: str = 'application/octet-stream'


class JobRequest(BaseModel):
    claimId: Optional[str] = None
    files: List[JobFile] = Field(default_factory=list)


class FieldResult(BaseModel):
    id: str
    section: str
    label: str
    value: str
    conf: int = 0
    original: str = ''
    verified: bool = False
    history: List[Dict[str, Any]] = Field(default_factory=list)
    masked: bool = False
    detect: Optional[str] = None


class PageResult(BaseModel):
    n: int
    cls: str
    conf: int
    label: str


class DocumentResult(BaseModel):
    id: str
    name: str
    type: str
    source: str = 'OCR'
    size: str = '0.0 MB'
    ext: str = 'pdf'
    uploaded: str
    ocrStatus: Literal['Queued', 'Processing', 'Completed', 'Needs review', 'Failed'] = 'Completed'
    handwritten: bool = False
    language: str = 'English'
    pages: List[PageResult] = Field(default_factory=list)
    fields: List[FieldResult] = Field(default_factory=list)
    detections: List[str] = Field(default_factory=list)
    medical: bool = True
    validated: bool = False
    masked: bool = False


class JobState(BaseModel):
    jobId: str
    status: Literal['queued', 'processing', 'completed', 'failed', 'needs_review'] = 'queued'
    progress: int = 0
    files: List[Dict[str, Any]] = Field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    engines: Dict[str, str]
    models_ready: Dict[str, bool]
    version: str
