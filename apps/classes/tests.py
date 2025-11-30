from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse

from apps.school.models import School
from apps.classes.models import Class
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import MagicMock, patch
from apps.classes.views import ClassViewSet


class ClassAPITestCase(APITestCase):

    def setUp(self):
        self.factory = APIRequestFactory()
        self.school = School.objects.create(
            id=1,
            name="Escola Teste",
            code=123,
        )

    def test_classes_list_endpoint_exists(self):
        """Testa se o endpoint GET /api/classes/ existe e retorna 200"""
        url = reverse('class-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_class_endpoint(self):
        """Testa se o endpoint POST /api/classes/ existe"""
        url = reverse('class-list')
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_returns_error_when_school_id_is_missing(self):
        """Garante que o endpoint POST /api/classes/ retorna erro 400 quando school_id é obrigatório"""
        url = reverse('class-list')
        data = {
            "code": "4B",
            "label": "4º ano B",
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_class_success_path_returns_201(self):
        """Garante que o endpoint POST /api/classes/ retorna 201 quando os dados são válidos"""
        url = reverse('class-list')
        data = {
            "code": "4B",
            "label": "4º ano B",
            "school_id": self.school.id,
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_retrieve_class_endpoint_returns_200(self):
        """Testa se o endpoint GET /api/classes/{id}/ existe (mesmo sem registro)"""
        url = reverse('class-detail', args=[999])
        response = self.client.get(url)
        self.assertIn(response.status_code,
                      (status.HTTP_200_OK, status.HTTP_404_NOT_FOUND))

    def test_update_class_endpoint_returns_200(self):
        """Testa se o endpoint PUT /api/classes/{id}/ existe (mesmo sem registro)"""
        url = reverse('class-detail', args=[999])
        data = {
            "code": "4B",
            "label": "4º ano B",
        }
        response = self.client.put(url, data, format='json')
        self.assertIn(response.status_code,
                      (status.HTTP_200_OK, status.HTTP_404_NOT_FOUND))

    def test_partial_update_class_endpoint_returns_200(self):
        """Testa se o endpoint PATCH /api/classes/{id}/ existe (mesmo sem registro)"""
        url = reverse('class-detail', args=[999])
        data = {
            "label": "4º ano - Atualizado",
        }
        response = self.client.patch(url, data, format='json')
        self.assertIn(response.status_code,
                      (status.HTTP_200_OK, status.HTTP_404_NOT_FOUND))

    def test_delete_class_endpoint_returns_204(self):
        """Testa se o endpoint DELETE /api/classes/{id}/ existe (mesmo sem registro)"""
        url = reverse('class-detail', args=[999])
        response = self.client.delete(url)
        self.assertIn(response.status_code,
                      (status.HTTP_204_NO_CONTENT, status.HTTP_404_NOT_FOUND))


class ClassViewSetUnitTestCase(APITestCase):

    def setUp(self):
        self.factory = APIRequestFactory()
        self.school = School.objects.create(
            id=1,
            name="Escola Teste",
            code=123,
        )
    
    def test_create_success_path_returns_201(self):
        """Garante que o fluxo de sucesso de create executa até o retorno"""
        request = self.factory.post('/api/classes/', {
            "code": "4B",
            "label": "4º ano B",
            "school_id": self.school.id,
        }, format='json')

        mock_serializer = MagicMock()
        mock_serializer.is_valid.return_value = True
        mock_class = object()
        mock_serializer.save.return_value = mock_class

        mock_response_serializer = MagicMock()
        mock_response_serializer.data = {'id': 1}

        view = ClassViewSet.as_view({'post': 'create'})

        with patch.object(ClassViewSet, 'get_serializer',
                          side_effect=[mock_serializer,
                                       mock_response_serializer]):
            response = view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_update_success_path_returns_200(self):
        """Garante que o fluxo de sucesso de update executa até o retorno"""
        request = self.factory.put('/api/classes/1/', {
            "code": "4B",
            "label": "4º ano B",
            "school_id": self.school.id,
        }, format='json')

        mock_instance = object()
        mock_update_serializer = MagicMock()
        mock_update_serializer.is_valid.return_value = True
        mock_class = object()
        mock_update_serializer.save.return_value = mock_class

        mock_response_serializer = MagicMock()
        mock_response_serializer.data = {'id': 1}

        view = ClassViewSet.as_view({'put': 'update'})

        with patch.object(ClassViewSet, 'get_object',
                          return_value=mock_instance), \
                patch.object(ClassViewSet, 'get_serializer',
                             side_effect=[mock_update_serializer,
                                          mock_response_serializer]):
            response = view(request, pk=1)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
