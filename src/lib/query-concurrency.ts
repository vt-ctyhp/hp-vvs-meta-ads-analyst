export async function runLimitedTasks<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  if (!tasks.length) return [];

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), tasks.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }));

  return results;
}
