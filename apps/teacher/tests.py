from django.test import SimpleTestCase
from rest_framework.test import APITestCase, APIRequestFactory
from rest_framework import status
from django.urls import reverse
from unittest.mock import MagicMock, patch

from apps.school.models import School
from apps.teacher.models import Teacher, ReductionDay, DiaryType
from apps.classes.models import Class
from apps.teacher.views import TeacherViewSet


class TeacherAPITestCase(APITestCase):

    def setUp(self):
        self.school = School.objects.create(
            id=1,
            name="Escola Teste",
            code=123,
        )
        self.teacher = Teacher.objects.create(
            name="Professor Teste",
            code="T001",
            password="senha-secreta",
            reduction_day=ReductionDay.MONDAY,
            diary_type=DiaryType.C1,
            school_id=self.school.id,
        )
        self.class_instance = Class.objects.create(
            code="4A",
            label="4º ano",
            school=self.school,
            teacher=self.teacher,
        )

    def test_teachers_list_endpoint_exists(self):
        """Testa se o endpoint GET /api/teachers/ existe e retorna 200"""
        url = reverse('teacher-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_teachers_search_endpoint_exists_without_query(self):
        """Testa se o endpoint GET /api/teachers/search/ existe sem parâmetro q"""
        url = reverse('teacher-search')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    def test_teachers_search_endpoint_filters_by_query(self):
        """Testa se o endpoint GET /api/teachers/search/ filtra por nome/código"""
        url = reverse('teacher-search')
        response = self.client.get(url, {'q': 'T001'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['code'], 'T001')

    def test_create_teacher_endpoint_exists(self):
        """Testa se o endpoint POST /api/teachers/ existe"""
        url = reverse('teacher-list')
        response = self.client.post(url, {})
        # Deve retornar 400 por dados inválidos, mas o endpoint existe
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_teacher_endpoint_returns_200(self):
        """Testa se o endpoint GET /api/teachers/{id}/ funciona"""
        url = reverse('teacher-detail', args=[self.teacher.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_partial_update_teacher_endpoint_returns_200(self):
        """Testa se o endpoint PATCH /api/teachers/{id}/ funciona"""
        url = reverse('teacher-detail', args=[self.teacher.id])
        data = {
            "name": "Professor Atualizado",
        }
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_delete_teacher_endpoint_exists(self):
        """Testa se o endpoint DELETE /api/teachers/{id}/ existe"""
        url = reverse('teacher-detail', args=[self.teacher.id])
        response = self.client.delete(url)
        self.assertIn(response.status_code,
                      (status.HTTP_204_NO_CONTENT, status.HTTP_404_NOT_FOUND))


class TeacherViewSetUnitTestCase(SimpleTestCase):

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_create_success_path_returns_201(self):
        """Garante que o fluxo de sucesso de create executa até o retorno"""
        request = self.factory.post('/api/teachers/', {
            "name": "Novo Professor",
        }, format='json')

        mock_serializer = MagicMock()
        mock_serializer.is_valid.return_value = True
        mock_teacher = object()
        mock_serializer.save.return_value = mock_teacher

        mock_response_serializer = MagicMock()
        mock_response_serializer.data = {'id': 1}

        view = TeacherViewSet.as_view({'post': 'create'})

        with patch.object(TeacherViewSet, 'get_serializer',
                          side_effect=[mock_serializer,
                                       mock_response_serializer]):
            response = view(request)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_update_success_path_returns_200(self):
        """Garante que o fluxo de sucesso de update executa até o retorno"""
        request = self.factory.put('/api/teachers/1/', {
            "name": "Professor Atualizado",
        }, format='json')

        mock_instance = object()
        mock_update_serializer = MagicMock()
        mock_update_serializer.is_valid.return_value = True
        mock_teacher = object()
        mock_update_serializer.save.return_value = mock_teacher

        mock_response_serializer = MagicMock()
        mock_response_serializer.data = {'id': 1}

        view = TeacherViewSet.as_view({'put': 'update'})

        with patch.object(TeacherViewSet, 'get_object',
                          return_value=mock_instance), \
                patch.object(TeacherViewSet, 'get_serializer',
                             side_effect=[mock_update_serializer,
                                          mock_response_serializer]):
            response = view(request, pk=1)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

