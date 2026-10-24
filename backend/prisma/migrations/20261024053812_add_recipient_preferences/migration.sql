-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "acceptedCategories" "FoodCategory"[] DEFAULT ARRAY[]::"FoodCategory"[],
ADD COLUMN     "dietaryRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[];
