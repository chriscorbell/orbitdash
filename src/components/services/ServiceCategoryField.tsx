import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NEW_CATEGORY_VALUE,
  NONE_CATEGORY_VALUE,
} from "@/components/services/useServiceDialogState";

interface ServiceCategoryFieldProps {
  categoryInputId: string;
  categoryOptions: string[];
  newCategory: string;
  newCategoryInputId: string;
  onNewCategoryChange: (value: string) => void;
  onSelectedCategoryChange: (value: string) => void;
  selectedCategory: string;
}

export function ServiceCategoryField({
  categoryInputId,
  categoryOptions,
  newCategory,
  newCategoryInputId,
  onNewCategoryChange,
  onSelectedCategoryChange,
  selectedCategory,
}: ServiceCategoryFieldProps) {
  return (
    <div className="space-y-2">
      <Label id={`${categoryInputId}-label`} htmlFor={categoryInputId} className="font-semibold">
        Category
      </Label>
      <Select value={selectedCategory} onValueChange={onSelectedCategoryChange}>
        <SelectTrigger
          id={categoryInputId}
          name="category"
          aria-label="Category"
          aria-labelledby={`${categoryInputId}-label`}
          className="w-full font-normal"
        >
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_CATEGORY_VALUE}>Uncategorized</SelectItem>
          {categoryOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          <SelectItem value={NEW_CATEGORY_VALUE}>New category…</SelectItem>
        </SelectContent>
      </Select>
      {selectedCategory === NEW_CATEGORY_VALUE && (
        <>
          <Label htmlFor={newCategoryInputId} className="sr-only">
            New category name
          </Label>
          <Input
            id={newCategoryInputId}
            name="newCategory"
            autoComplete="off"
            value={newCategory}
            onChange={(event) => onNewCategoryChange(event.target.value)}
            placeholder="e.g. Infrastructure, Media"
            className="font-normal"
            required
          />
        </>
      )}
    </div>
  );
}
