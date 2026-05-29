export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}
