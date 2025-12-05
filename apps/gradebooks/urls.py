from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.gradebooks.views import GradebookViewSet

router = DefaultRouter()
router.register(r'gradebooks', GradebookViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
