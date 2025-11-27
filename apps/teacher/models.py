from django.db import models
from apps.school.models import School


class ReductionDay(models.IntegerChoices):
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    
class DiaryType(models.TextChoices):
    C1 = 'c1' #  Creche, Pré-escola, 1º ao 5º ano, EJA - 1º SEGMENTO
    C2 = 'c2' #  ENSINO FUNDAMENTAL - 6º ao 9º ano, EJA - 2º SEGMENTO

class Teacher(models.Model):
    id = models.IntegerField(unique=True, primary_key=True, auto_created=True)
    code = models.CharField(max_length=6)
    password = models.CharField()
    reduction_day = models.IntegerField(choices=ReductionDay.choices)
    diary_type = models.CharField(choices=DiaryType.choices)
    school = models.ForeignKey(School, on_delete=models.CASCADE)

    class Meta:
        ordering = ['code', 'school__name']