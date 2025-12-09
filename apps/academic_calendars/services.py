import fitz
import re
import os
from rest_framework.exceptions import NotFound
from apps.academic_calendars.schemas import CalendarData, Stage, LegendItem
from typing import List
from datetime import date


MONTHS = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO",
]

DAYS = ["D", "S", "T", "Q", "Q", "S", "S"]


class AcademicCalendarPDFProcessor:

    def _get_year(self, full_pdf_text: str) -> int:
        m = re.search(r"CALEND[ÁA]RIO LETIVO\s+(\d{4})", full_pdf_text)
        if m:
            return int(m.group(1))

        raise NotFound("Ano atual não foi encontrado no arquivo")

    def _get_stages(self, full_pdf_text: str) -> List[Stage]:
        pattern = re.compile(
            r"([IVX]+)\s+ETAPA:\s*"
            r"(\d{1,2})//?(\d{1,2})\s*"
            r"\S\s*"
            r"(\d{1,2})/(\d{1,2})/(\d{4})",
            flags=re.IGNORECASE,
        )

        text = full_pdf_text.upper()
        stages: List[Stage] = []
        for m in pattern.finditer(text):
            stage_id = m.group(1)
            start_day, start_month = int(m.group(2)), int(m.group(3))
            end_day, end_month, curr_year = int(
                m.group(4)), int(m.group(5)), int(m.group(6))

            start_date = date(curr_year, start_month, start_day)
            end_date = date(curr_year, end_month, end_day)
            stages.append(
                Stage(id=stage_id, start_date=start_date, end_date=end_date))

        return stages

    def extract_legend(self, page: fitz.Page) -> List[LegendItem]:
        legend_items = []
        for line in page.get_text().split("\n"):
            if line.strip():
                # Aqui seria implementada a lógica para extrair legendas
                # Por enquanto, retorna lista vazia
                pass
        return legend_items

    def process_pdf(self, pdf_file: bytes) -> CalendarData:
        doc = fitz.open(stream=pdf_file, filetype="pdf")

        if len(doc) == 0:
            raise ValueError("PDF sem páginas.")

        page = doc[0]

        full_text = page.get_text()
        year = self._get_year(full_text)
        stages = self._get_stages(full_text)

        page = doc[0]
        for month in MONTHS:
            rects = page.search_for(month)
            if not rects:
                raise ValueError(f"Tabela do mês {month} não encontrada.")
            month_rect = rects[0]
            table_rect = fitz.Rect(
                month_rect.x0 - 70,
                month_rect.y0,
                month_rect.x1 + 70,
                month_rect.y1 + 120,
            )
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat, clip=table_rect)
            cwd = os.getcwd()
            image_path = os.path.join(
                cwd, "images", f"{year}_{month}.png")
            os.makedirs(os.path.dirname(image_path), exist_ok=True)
            with open(image_path, "wb") as f:
                f.write(pix.tobytes("png"))

        return CalendarData(year=year,
                            stages=stages,
                            days=[],
                            legend=[],
                            monthly_meta=[])
