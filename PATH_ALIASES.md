# Path Aliases Guide

This project uses TypeScript path aliases to enable cleaner imports throughout the codebase.

## Available Aliases

| Alias              | Maps to              | Description                 |
| ------------------ | -------------------- | --------------------------- |
| `@/*`              | `src/*`              | Root source directory       |
| `@/utils/*`        | `src/utils/*`        | Utility functions           |
| `@/types/*`        | `src/types/*`        | TypeScript type definitions |
| `@/data/*`         | `src/data/*`         | Data files and JSON         |
| `@/presentation/*` | `src/presentation/*` | React components and pages  |
| `@/domain/*`       | `src/domain/*`       | Domain logic and constants  |
| `@/hooks/*`        | `src/hooks/*`        | Custom React hooks          |
| `@/constants/*`    | `src/constants/*`    | Application constants       |

## Usage Examples

### Before (relative imports)

```typescript
import { getPlayer } from "../../data";
import { ExtendedMatchup } from "../../types/matchup";
import { getPlayoffWeekStart } from "../../utils/playoffUtils";
import { calculateWinPercentage } from "../../utils/recordUtils";
```

### After (path aliases)

```typescript
import { getPlayer } from "@/data";
import { ExtendedMatchup } from "@/types/matchup";
import { getPlayoffWeekStart } from "@/utils/playoffUtils";
import { calculateWinPercentage } from "@/utils/recordUtils";
```

### Utility Index Import

```typescript
// Import multiple utilities from the centralized index
import {
  getPlayoffWeekStart,
  calculateWinPercentage,
  getManagerIdBySleeperOwnerId,
} from "@/utils";
```

## Configuration Files

### TypeScript (`tsconfig.app.json`)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/utils/*": ["src/utils/*"],
      "@/types/*": ["src/types/*"],
      "@/data/*": ["src/data/*"],
      "@/presentation/*": ["src/presentation/*"],
      "@/domain/*": ["src/domain/*"],
      "@/hooks/*": ["src/hooks/*"],
      "@/constants/*": ["src/constants/*"]
    }
  }
}
```

### Vite (`vite.config.ts`)

```typescript
export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
      "@/utils": "/src/utils",
      "@/types": "/src/types",
      "@/data": "/src/data",
      "@/presentation": "/src/presentation",
      "@/domain": "/src/domain",
      "@/hooks": "/src/hooks",
      "@/constants": "/src/constants",
    },
  },
});
```

## Benefits

1. **Cleaner Imports**: No more `../../../` relative paths
2. **Better Refactoring**: Moving files doesn't break imports
3. **IDE Support**: Better autocomplete and navigation
4. **Consistency**: Standardized import patterns across the codebase
5. **Maintainability**: Easier to understand and modify import statements

## Migration Guide

When updating existing files to use path aliases:

1. Replace relative imports with alias imports
2. Use the utility index (`@/utils`) for multiple utility imports
3. Test that the build still works after changes
4. Update any import statements in the same commit

## Best Practices

- Use `@/utils` for importing utility functions
- Use specific aliases (`@/types`, `@/data`) for type and data imports
- Prefer the utility index for multiple utility imports
- Keep alias usage consistent across the codebase
