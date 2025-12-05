from django.db import models

class School(models.Model):
    id = models.IntegerField(unique=True, primary_key=True, auto_created=True)
    name = models.CharField(max_length=100)
    code = models.IntegerField(unique=True)

    class Meta:
        verbose_name = 'Escola'
        verbose_name_plural = 'Escolas'
        ordering = ['name']

