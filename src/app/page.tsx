import { StorePicker } from "@/components/StorePicker";
import { storeInfos } from "@/config/stores";

export default function HomePage() {
  return <StorePicker stores={storeInfos} />;
}
