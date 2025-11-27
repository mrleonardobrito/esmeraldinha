from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.teacher.views import TeacherViewSet

router = DefaultRouter()
router.register(r'teachers', TeacherViewSet, basename='teacher')

urlpatterns = [
    path('', include(router.urls)),
]