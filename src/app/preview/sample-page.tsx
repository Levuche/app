import {
  AppIcon,
  BookingCard,
  CameraIcon,
  CreatorFooter,
  CreatorHeader,
  EmailIcon,
  FeaturedLink,
  FeaturedPack,
  GlobeIcon,
  ImageGrid,
  LinkList,
  MembershipCard,
  SiteLinkButton,
  SiteSection,
  SocialIcons,
  Testimonials,
  VideoIcon,
  YouTubeVideo,
  type SiteGridBlock,
} from '@levuche/ui';

/*
 * A sample creator's page, the same one the @levuche/ui stories use, until
 * pages are saved and loaded for real. Links go to example.com, and nothing
 * on it loads from another site.
 */

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/example',
    icon: <CameraIcon size={20} />,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@example',
    icon: <VideoIcon size={20} />,
  },
  {
    label: 'Website',
    href: 'https://example.com',
    icon: <GlobeIcon size={20} />,
  },
];

const LINKS = [
  {
    label: 'YouTube channel',
    href: 'https://www.youtube.com/@example',
    icon: <VideoIcon size={20} />,
    detail: 'New video every Friday',
  },
  {
    label: 'Get the app',
    href: 'https://example.com/app',
    icon: <AppIcon size={20} />,
  },
  {
    label: 'Blog',
    href: 'https://example.com/blog',
    icon: <GlobeIcon size={20} />,
  },
  {
    label: 'Email me',
    href: 'mailto:hello@example.com',
    icon: <EmailIcon size={20} />,
  },
];

/** The sample creator's blocks, in reading order. */
export const SAMPLE_BLOCKS: SiteGridBlock[] = [
  {
    id: 'profile',
    kind: 'profile',
    children: (
      <div className="flex flex-col gap-4">
        <CreatorHeader
          name="Desi Origins"
          tagline="How everyday things began"
        />
        <SocialIcons links={SOCIALS} />
      </div>
    ),
  },
  {
    id: 'presets',
    kind: 'link',
    children: (
      <SiteLinkButton href="https://example.com/presets" fullWidth>
        Shop my presets
      </SiteLinkButton>
    ),
  },
  {
    id: 'app',
    kind: 'link',
    children: (
      <SiteLinkButton
        href="https://example.com/app"
        variant="outline"
        fullWidth
      >
        Get the app
      </SiteLinkButton>
    ),
  },
  {
    id: 'featured',
    kind: 'card',
    children: (
      <FeaturedLink
        href="https://example.com/videos/tea"
        title="New: how tea came to India"
        detail="12 minutes, out now"
      />
    ),
  },
  {
    id: 'pack',
    kind: 'card',
    children: (
      <FeaturedPack
        title="Origins reel pack"
        detail="100 prompts, a guide and 12 templates"
        price="$12"
      />
    ),
  },
  {
    id: 'video',
    kind: 'media',
    children: (
      <SiteSection title="Latest video">
        <YouTubeVideo
          video="https://www.youtube.com/watch?v=M7lc1UVf-VE"
          title="How tea came to India"
          poster={null}
        />
      </SiteSection>
    ),
  },
  {
    id: 'booking',
    kind: 'card',
    children: (
      <BookingCard
        title="Origin story review"
        detail="I read your script and tell you what to cut."
        duration="30 min"
        price="$40"
        href="https://example.com/book"
        headingAs="h2"
      />
    ),
  },
  {
    id: 'membership',
    kind: 'card',
    children: (
      <MembershipCard
        title="Insiders"
        price="$5"
        perks={['A bonus story every week', 'Early access to new packs']}
        href="https://example.com/join"
        headingAs="h2"
        featured
      />
    ),
  },
  {
    id: 'links',
    kind: 'links',
    children: <LinkList label="Desi Origins links" links={LINKS} />,
  },
  {
    id: 'photos',
    kind: 'gallery',
    children: (
      <SiteSection title="Photos">
        <ImageGrid
          images={[
            { alt: 'Chai on a clay stove' },
            { alt: 'A spice market in Kochi' },
            { alt: 'Tea leaves drying in Assam' },
          ]}
        />
      </SiteSection>
    ),
  },
  {
    id: 'reviews',
    kind: 'text',
    children: (
      <SiteSection title="What people say">
        <Testimonials
          items={[
            {
              quote: 'The prompts saved me a whole week of planning.',
              name: 'Meera K.',
              detail: 'Bought the reel pack',
              rating: 5,
            },
            {
              quote: 'Short, clear and fun. My students love these.',
              name: 'Arjun S.',
              detail: 'Insiders member',
            },
          ]}
        />
      </SiteSection>
    ),
  },
  {
    id: 'footer',
    kind: 'band',
    children: (
      <CreatorFooter
        links={[
          { label: 'Privacy', href: 'https://example.com/privacy' },
          { label: 'Refunds', href: 'https://example.com/refunds' },
        ]}
      />
    ),
  },
];
