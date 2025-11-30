import json

from django.http import JsonResponse
from django.test import SimpleTestCase, RequestFactory
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from unittest.mock import patch
from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    AuthenticationFailed,
)
from rest_framework.response import Response

from django.core.exceptions import ValidationError

from apps.school.models import School
from esmeraldinha.exceptions import (
    custom_exception_handler,
    _get_error_code,
    _get_user_friendly_message,
)
from esmeraldinha.middleware import ErrorHandlingMiddleware


class SchoolAPITestCase(APITestCase):

    def test_schools_list_endpoint_exists(self):
        """Testa se o endpoint GET /api/schools/ existe e retorna 200"""
        url = reverse('school-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_school_endpoint_exists(self):
        """Testa se o endpoint POST /api/schools/ existe"""
        url = reverse('school-list')
        response = self.client.post(url, {})
        # Deve retornar 400 por dados inválidos, mas o endpoint existe
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_school_endpoint_returns_404(self):
        """Testa se o endpoint GET /api/schools/{id}/ existe (mesmo sem registro)"""
        url = reverse('school-detail', args=[999])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_school_endpoint_returns_200(self):
        """Testa se o endpoint PUT /api/schools/{id}/ existe (mesmo sem registro)"""
        url = reverse('school-detail', args=[999])
        data = {
            "name": "Escola Atualizada",
            "code": 123,
        }
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partial_update_school_endpoint_returns_404(self):
        """Testa se o endpoint PATCH /api/schools/{id}/ existe (mesmo sem registro)"""
        url = reverse('school-detail', args=[999])
        data = {
            "name": "Escola Parcialmente Atualizada",
        }
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_school_endpoint_returns_404(self):
        """Testa se o endpoint DELETE /api/schools/{id}/ existe (mesmo sem registro)"""
        url = reverse('school-detail', args=[999])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_health_check_endpoint_returns_ok(self):
        """Garante que o endpoint /api/health/ responde OK"""
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data.get('status'), 'ok')
        self.assertIn('message', data)
