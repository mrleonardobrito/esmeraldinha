# Generated migration to seed schools data

import json
import os
from django.db import migrations


def seed_schools(apps, schema_editor):
    School = apps.get_model('school', 'School')
    
    migration_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(os.path.dirname(migration_dir))
    data_path = os.path.join(base_dir, 'school', 'fixtures', 'schools.json')
    if not os.path.exists(data_path):
        raise FileNotFoundError(f'School fixture file not found: {data_path}')
    
    with open(data_path, 'r', encoding='utf-8') as f:
        schools_data = json.load(f)
    
    for school_data in schools_data:
        School.objects.update_or_create(
            id=school_data['id'],
            defaults={
                'name': school_data['name'],
                'code': school_data['code'],
            }
        )


def reverse_seed_schools(apps, schema_editor):
    School = apps.get_model('school', 'School')
    School.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('school', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_schools, reverse_seed_schools),
    ]

