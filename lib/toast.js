import { toast } from "sonner";

export function toastSuccess(message, description) {
  toast.success(message, description ? { description } : undefined);
}

export function toastError(message, description) {
  toast.error(message, description ? { description } : undefined);
}

export function toastInfo(message, description) {
  toast.info(message, description ? { description } : undefined);
}
