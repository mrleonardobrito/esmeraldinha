from django.shortcuts import render
from rest_framework import viewsets
from apps.gradebook.models import Gradebook
from apps.gradebook.serializers import GradebookSerializer
from drf_spectacular.utils import extend_schema

@extend_schema(tags=['Gradebook'])
class GradebookViewSet(viewsets.ModelViewSet):
    queryset = Gradebook.objects.all()
    serializer_class = GradebookSerializer
    action_to_serializer = {
        'list': GradebookSerializer,
        'retrieve': GradebookSerializer,
        'create': GradebookSerializer,
        'update': GradebookSerializer,
        'partial_update': GradebookSerializer,
    }