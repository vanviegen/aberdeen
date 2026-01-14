# Prediction (Optimistic UI)

Apply UI changes immediately, auto-revert when server responds.

## API

```typescript
import { applyPrediction, applyCanon } from 'aberdeen/prediction';
```

### `applyPrediction(func)`
Runs function and records all proxy changes as a "prediction".
Returns a `Patch` to use as `dropPatches` later, when the server responds.

### `applyCanon(func?, dropPatches?)`
1. Reverts all predictions
2. Runs `func` (typically applies server data)
3. Drops specified patches
4. Re-applies remaining predictions that still apply cleanly

## Example
```typescript
async function toggleTodo(todo: Todo) {
    // Optimistic update
    const patch = applyPrediction(() => {
        todo.done = !todo.done;
    });

    try {
        const data = await api.updateTodo(todo.id, { done: todo.done });
        
        // Server responded - apply canonical state
        applyCanon(() => {
            Object.assign(todo, data);
        }, [patch]);
    } catch {
        // On error, just drop the prediction to revert
        applyCanon(undefined, [patch]);
    }
}
```

## When to Use
- When you want immediate UI feedback for user actions for which a server is authoritative.
- As doing this manually for each such case is tedious, this should usually be integrated into the data updating/fetching layer.
