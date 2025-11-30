from rest_framework import viewsets
from .models import Class
from .serializers import ClassSerializer
from drf_spectacular.utils import extend_schema, OpenApiResponse


@extend_schema(tags=['Turmas'])
class ClassViewSet(viewsets.ModelViewSet):
    serializer_class = ClassSerializer

    def get_queryset(self):
        return Class.objects.all()

    @extend_schema(
        summary='Lista todas as turmas',
        description='Retorna uma lista paginada de todas as turmas cadastradas. Use os parâmetros ?page=N para navegar entre páginas.',
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        summary='Cria uma nova turma',
        description='Cria uma nova turma',
        request=ClassSerializer,
        responses={
            201: OpenApiResponse(
                response=ClassSerializer,
                description='Turma criada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            )
        }
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @extend_schema(
        summary='Retorna detalhes de uma turma',
        description='Retorna os detalhes completos de uma turma específica',
        responses={
            200: OpenApiResponse(
                response=ClassSerializer,
                description='Turma retornada com sucesso'
            ),
            404: OpenApiResponse(
                description='Turma não encontrada'
            )
        }
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        summary='Atualiza uma turma',
        description='Atualiza todos os campos de uma turma',
        request=ClassSerializer,
        responses={
            200: OpenApiResponse(
                response=ClassSerializer,
                description='Turma atualizada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            ),
            404: OpenApiResponse(
                description='Turma não encontrada'
            )
        }
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        summary='Atualiza parcialmente uma turma',
        description='Atualiza apenas os campos fornecidos de uma turma',
        request=ClassSerializer,
        responses={
            200: OpenApiResponse(
                response=ClassSerializer,
                description='Turma atualizada com sucesso'
            ),
            400: OpenApiResponse(
                description='Dados inválidos'
            ),
            404: OpenApiResponse(
                description='Turma não encontrada'
            )
        }
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        summary='Deleta uma turma',
        description='Remove uma turma do sistema',
        responses={
            204: OpenApiResponse(
                description='Turma deletada com sucesso'
            ),
            404: OpenApiResponse(
                description='Turma não encontrada'
            )
        }
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
