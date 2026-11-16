import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

/** Opens the task sheet by putting the task id in the URL, so Back closes it and the link can be shared. */
export function useOpenTask() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (id: string) => {
      const params = new URLSearchParams(location.search);
      params.set("task", id);
      navigate({ pathname: location.pathname, search: `?${params}` }, { state: { sheet: true } });
    },
    [navigate, location.pathname, location.search],
  );
}

export function useCloseTask() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if ((location.state as { sheet?: boolean } | null)?.sheet) {
      navigate(-1);
      return;
    }
    const params = new URLSearchParams(location.search);
    params.delete("task");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
  }, [navigate, location.pathname, location.search, location.state]);
}
