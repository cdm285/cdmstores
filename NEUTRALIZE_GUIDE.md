# Neutralizing cdmstore Reference

This commit addresses obsolete references to "cdmstore" in the repository, ensuring that all mentions are updated to "cdmstores" and any relevant file paths are adjusted accordingly.

Changes include:
1. Deleting the obsolete "cdmstore" file if it exists.
2. Updating all occurrences of "cdmstore" in relevant files to "cdmstores", excluding code identifiers.
3. Ensuring no imports, asset paths, or configurations point to the deprecated path.
4. Adjusting any scripts that referenced absolute paths.

Functionality has been checked to maintain standards and ensure the project works under the new naming conventions.