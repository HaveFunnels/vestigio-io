import algoliasearch from "algoliasearch";
import { useEffect } from "react";
import { Hits, InstantSearch } from "react-instantsearch";
import { integrations } from "../../../integrations.config";
import CustomHits from "./CustomHits";
import SearchBox from "./CustomSearchBox";
import EmptyState from "./EmptyState";

const appID = process.env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID as string;
const apiKEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY as string;
const INDEX = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME as string;

const algoliaClient = algoliasearch(appID, apiKEY);

type Props = {
	searchModalOpen: boolean;
	setSearchModalOpen: (value: boolean) => void;
};

export default function GlobalSearchModal(props: Props) {
	const { searchModalOpen, setSearchModalOpen } = props;

	useEffect(() => {
		// closing modal while clicking outside
		function handleClickOutside(event: any) {
			if (!event.target.closest(".modal-content")) {
				setSearchModalOpen(false);
			}
		}

		if (searchModalOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [searchModalOpen, setSearchModalOpen]);

	if (!searchModalOpen) return null;

	return (
		<div className='fixed left-0 top-0 z-[99999] flex h-full min-h-screen w-full justify-center bg-[rgba(94,93,93,0.25)] px-4 py-[12vh] backdrop-blur-sm'>
			<div className='modal-content relative w-full max-w-[600px] overflow-y-auto rounded-xl bg-white shadow-lg dark:bg-black'>
				<div>
					<InstantSearch
						insights={false}
						searchClient={algoliaClient}
						indexName={INDEX}
					>
						<SearchBox />
						<EmptyState />
						{integrations?.isAlgoliaEnabled && (
							<Hits
								hitComponent={({ hit }) => (
									<CustomHits
										hit={hit}
										setSearchModalOpen={setSearchModalOpen}
									/>
								)}
							/>
						)}
					</InstantSearch>
				</div>
			</div>
		</div>
	);
};
