import FinderClient from './FinderClient';

export const metadata = {
  title: 'Find it — Store Map',
  description: 'Search products and aisles in this store.',
};

export default function PublicFinderPage({ params }) {
  return <FinderClient slug={params.slug} />;
}
