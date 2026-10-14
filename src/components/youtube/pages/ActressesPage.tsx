"use client";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "../basics";
import { CHANNELS } from "@/lib/youtube/data";
import { useYT } from "@/store/youtube-store";
import { Pagination, useUrlPage } from "../Pagination";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PAGE_SIZE = 36;

export function ActressesPage({ initialPage = 1 }: { initialPage?: number }) {
  const navigate = useYT((state) => state.navigate);
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("All");
  const [page, setPage] = useUrlPage(initialPage);
  const items = useMemo(() => CHANNELS.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) && (letter === "All" || item.name.toUpperCase().startsWith(letter))), [letter, query]);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visibleItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return <div className="mx-auto w-full max-w-[1284px] px-4 pb-10 pt-5">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="text-3xl font-bold text-yt-text">Actresses</h1><p className="mt-1 text-sm text-yt-text2">Browse profiles and all related videos.</p></div><label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-full border border-yt-border px-4"><Search className="h-4 w-4 text-yt-text2"/><input value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1)}} placeholder="Search actresses" className="min-w-0 flex-1 bg-transparent text-sm text-yt-text outline-none"/></label></div>
    <div className="no-scrollbar mb-7 flex gap-1 overflow-x-auto pb-1">{["All",...LETTERS].map((value)=><button type="button" key={value} onClick={()=>{setLetter(value);setPage(1)}} className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-medium ${letter===value?"bg-yt-text text-yt-bg":"bg-yt-chip hover:bg-yt-hover"}`}>{value}</button>)}</div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{visibleItems.map((person)=>{const count=person.videoCount;return <button key={person.id} onClick={()=>navigate({type:"channel",channelId:person.id})} className="group text-center"><Avatar initials={person.initials} color={person.color} imgSrc={person.profileImageUrl} size={128} className="mx-auto transition-transform group-hover:scale-[1.03]"/><h2 className="mt-3 truncate text-base font-medium text-yt-text">{person.name}</h2><p className="text-xs text-yt-text2">{count} {count===1?"video":"videos"}</p></button>})}</div>
    <Pagination page={page} totalPages={totalPages} onPageChange={setPage}/>
    {items.length===0&&<p className="py-20 text-center text-sm text-yt-text2">No actresses found.</p>}
  </div>;
}
