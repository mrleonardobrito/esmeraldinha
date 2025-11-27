# Generated migration for School model

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='School',
            fields=[
                ('id', models.IntegerField(auto_created=True, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('code', models.IntegerField(unique=True)),
            ],
            options={
                'verbose_name': 'Escola',
                'verbose_name_plural': 'Escolas',
                'ordering': ['name'],
            },
        ),
    ]

