import { requestClient } from '#/api/request';

export interface PageData<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ConnSourceDTO {
  id: number;
  name: string;
  conn_type: string;
  host: string;
  port: number;
  username: string;
  password_encrypted: string;
  db_name: string;
  status: number;
  description?: string;
  created_time?: string;
  updated_time?: string | null;
}

export interface ConnSourceQuery {
  name?: string;
  conn_type?: string;
  status?: number;
  page?: number;
  size?: number;
}

export type CreateConnSourceParams = Omit<ConnSourceDTO, 'id' | 'created_time' | 'updated_time'>;
export type UpdateConnSourceParams = CreateConnSourceParams;

const BASE = '/api/v1/conn';

export async function getConnSourcesApi(params: ConnSourceQuery = {}) {
  return requestClient.get<PageData<ConnSourceDTO>>(BASE, { params });
}

export async function getConnSourceApi(pk: number) {
  return requestClient.get<ConnSourceDTO>(`${BASE}/${pk}`);
}

export async function createConnSourceApi(data: CreateConnSourceParams) {
  return requestClient.post(`${BASE}`, data);
}

export async function updateConnSourceApi(pk: number, data: UpdateConnSourceParams) {
  return requestClient.put(`${BASE}/${pk}`, data);
}

export async function deleteConnSourcesApi(pks: number[]) {
  return requestClient.delete(`${BASE}`, { data: { pks } });
}


