from django.db import models, transaction
from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from apps.teachers.models import Teacher
from apps.teachers.serializers import TeacherSerializer
from drf_spectacular.utils import extend_schema, OpenApiResponse


@extend_schema(tags=['Professores'])
class TeacherViewSet(viewsets.ModelViewSet):
    queryset = Teacher.objects.all()
    serializer_class = TeacherSerializer

    @extend_schema(
        summary='Lista todos os professores',
        description='Retorna uma lista paginada de todos os professores cadastrados. Use os parâmetros ?page=N para navegar entre páginas.',
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        summary='Retorna detalhes de um professor',
        description='Retorna os detalhes completos de um professor específico',
        responses={
            200: OpenApiResponse(
                response=TeacherSerializer,
                description='Professor retornado com sucesso'
            ),
            404: OpenApiResponse(
                description='Professor não encontrado'
            )
        }
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        summary='Cria um novo professor',
        description='Cria um novo professor com os dados fornecidos',
        request=TeacherSerializer,
        responses={
            201: OpenApiResponse(
                response=TeacherSerializer,
                description='Professor criado com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos fornecidos'
            )
        }
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        teacher = serializer.save()

        response_serializer = self.get_serializer(teacher)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        summary='Atualiza um professor completamente',
        description='Atualiza todas as informações de um professor específico',
        request=TeacherSerializer,
        responses={
            200: OpenApiResponse(
                response=TeacherSerializer,
                description='Professor atualizado com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos fornecidos'
            ),
            404: OpenApiResponse(
                description='Professor não encontrado'
            )
        }
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        teacher = serializer.save()

        response_serializer = self.get_serializer(teacher)
        return Response(response_serializer.data)

    @extend_schema(
        summary='Atualiza parcialmente um professor',
        description='Atualiza apenas os campos fornecidos de um professor específico',
        request=TeacherSerializer,
        responses={
            200: OpenApiResponse(
                response=TeacherSerializer,
                description='Professor atualizado com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos fornecidos'
            ),
            404: OpenApiResponse(
                description='Professor não encontrado'
            )
        }
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        summary='Remove um professor',
        description='Remove permanentemente um professor do sistema',
        responses={
            204: OpenApiResponse(
                description='Professor removido com sucesso'
            ),
            404: OpenApiResponse(
                description='Professor não encontrado'
            )
        }
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='search')
    @extend_schema(
        summary='Busca professores por código ou nome',
        description='Busca professores por código ou nome (parcial)',
        parameters=[
            {
                'name': 'q',
                'type': str,
                'location': 'query',
                'description': 'Termo de busca (código ou nome)'
            }
        ],
        responses={
            200: OpenApiResponse(
                response=TeacherSerializer(many=True),
                description='Resultados da busca retornados com sucesso'
            )
        }
    )
    def search(self, request):
        query = request.query_params.get('q', '')
        if not query:
            return Response([])
        teachers = self.queryset.filter(
            models.Q(code__icontains=query) |
            models.Q(name__icontains=query)
        )
        serializer = self.get_serializer(teachers, many=True)
        return Response(serializer.data)
