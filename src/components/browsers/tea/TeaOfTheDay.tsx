import { TeaStat } from "@/lib/types";
import { TeaCard } from "./TeaCard";

type Props = {
  tea: TeaStat;
  urlPrefix: string;
  onClick?: (id: string) => void;
};

export function TeaOfTheDay({ tea, urlPrefix, onClick }: Props) {
  return (
    <div className="">
      <div className="text-ink text-feature font-serif">
        {"Tea of the Day!"}
      </div>
      <TeaCard tea={tea} urlPrefix={urlPrefix} onClick={onClick}></TeaCard>
    </div>
  );
}
