// frontend/src/domain/models/Auth.ts
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}