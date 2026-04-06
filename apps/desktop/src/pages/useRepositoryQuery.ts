import { useEffect, useState } from "react";

export function useRepositoryQuery<T>(load: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);

    load()
      .then((result) => {
        if (isActive) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [load]);

  return { data, isLoading };
}
