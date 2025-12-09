from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum
from datetime import date


class DayType(str, Enum):
    SCHOOL_DAY = 'letivo'
    NON_SCHOOL_DAY = 'nao_letivo'
    NATIONAL_HOLIDAY = 'feriado_nacional'
    MUNICIPAL_HOLIDAY = 'feriado_municipal'
    OPTIONAL_DAY = 'ponto_facultativo'
    VACATION = 'ferias'
    RECESS = 'recesso'
    PLANNING = 'planejamento'
    RECOVERY_EVALUATION = 'avaliacao_recuperacao'
    EVENT = 'evento'


class StageId(str, Enum):
    I = 'I'
    II = 'II'
    III = 'III'
    IV = 'IV'


class Stage(BaseModel):
    id: StageId
    start_date: date = Field(description="Start date in ISO format")
    end_date: date = Field(description="End date in ISO format")


class Day(BaseModel):
    date: str = Field(description="Date in YYYY-MM-DD format")
    type: DayType
    stage: Optional[StageId] = None
    labels: List[str] = Field(default_factory=list,
                              description="Additional labels for the day")


class LegendItem(BaseModel):
    type: DayType
    description: str = Field(
        description="Friendly description for the day type")
    color_hex: Optional[str] = Field(
        None, description="Optional hexadecimal color for the day type")


class MonthlyMeta(BaseModel):
    month: int = Field(ge=1, le=12, description="Month number (1-12)")
    school_days: int = Field(
        description="Expected number of school days in the month")


class CalendarData(BaseModel):
    year: int = Field(description="Academic calendar year")
    stages: List[Stage]
    days: List[Day]
    legend: List[LegendItem]
    monthly_meta: Optional[List[MonthlyMeta]] = Field(
        None, description="Optional monthly metadata for reference")
