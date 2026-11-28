import type { IdentityProvider, IdentityRepository } from '../../modules/identity';
import { createLocalIdentityProvider, type LocalIdentityConfig } from './identity-provider';
import { createLocalIdentityRepository } from './identity-repository';

export function createLocalIdentityInfrastructure(config: LocalIdentityConfig): {
  provider: IdentityProvider;
  repository: IdentityRepository;
} {
  return {
    provider: createLocalIdentityProvider(config),
    repository: createLocalIdentityRepository(config.db),
  };
}
