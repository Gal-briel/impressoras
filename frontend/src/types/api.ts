export type ID = string;

export type ListResponse<T> = {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
};

export type ApiError = {
  detail?: string | Array<{ loc: string[]; msg: string; type?: string }>;
  message?: string;
};

export type QueryParams = Record<string, string | number | boolean | null | undefined>;
