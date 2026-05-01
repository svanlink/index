import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography
} from "@mui/material";
import type { NavItem } from "./SidebarNav";
import { Icon } from "./Icon";
import type { SearchResultItem } from "./TopUtilityBar";

interface AppShellProps {
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  section: string;
  sectionDetail?: string;
  toolbarAction?: ReactNode;
  brandLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(value: string): void;
  searchResults?: SearchResultItem[];
  children: ReactNode;
}

const drawerWidth = 240;
const macTrafficLightSafeArea = 32;

export function AppShell({
  navItems,
  footerNavItems = [],
  section,
  sectionDetail,
  toolbarAction,
  brandLabel = "Project Catalog",
  searchValue = "",
  searchPlaceholder = "Search projects, drives, or folders",
  onSearchChange,
  onSearchSubmit,
  searchResults = [],
  children
}: AppShellProps) {
  const showSearch = Boolean(onSearchChange);
  const showResults = showSearch && searchValue.trim().length > 0 && searchResults.length > 0;
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showSearch) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.(searchValue);
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowX: "hidden"
          }
        }}
      >
        <Box
          data-app-drag-region
          data-tauri-drag-region
          sx={{
            height: macTrafficLightSafeArea,
            flexShrink: 0
          }}
        />
        <Toolbar
          data-app-drag-region
          data-tauri-drag-region
          sx={{
            gap: 1.5,
            minHeight: 56,
            px: 2
          }}
        >
          <Box
            component="img"
            src="/favicon.png"
            alt=""
            draggable={false}
            data-app-drag-region
            data-tauri-drag-region
            sx={{ width: 32, height: 32 }}
          />
          <Typography
            variant="h6"
            noWrap
            data-app-drag-region
            data-tauri-drag-region
            sx={{ fontSize: 18, fontWeight: 500 }}
          >
            {brandLabel}
          </Typography>
        </Toolbar>

        <Divider />

        <List component="nav" aria-label="Primary navigation" sx={{ px: 1, py: 1 }}>
          {navItems.map((item) => (
            <MaterialNavItem key={item.label} item={item} />
          ))}
        </List>

        <Box data-app-drag-region data-tauri-drag-region sx={{ flex: 1 }} />

        {footerNavItems.length > 0 ? (
          <>
            <Divider />
            <List component="nav" aria-label="Secondary navigation" sx={{ px: 1, py: 1 }}>
              {footerNavItems.map((item) => (
                <MaterialNavItem key={item.label} item={item} />
              ))}
            </List>
          </>
        ) : null}
      </Drawer>

      <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}>
        <AppBar
          position="sticky"
          elevation={0}
          color="default"
          data-app-drag-region
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            backgroundImage: "none"
          }}
        >
          <Toolbar sx={{ gap: 3, minHeight: 64 }}>
            <Stack
              direction="row"
              spacing={1}
              data-app-drag-region
              data-tauri-drag-region
              sx={{ minWidth: 180, flex: "1 1 0", alignItems: "center" }}
            >
              <Typography
                variant="subtitle1"
                noWrap
                data-app-drag-region
                data-tauri-drag-region
                sx={{ fontWeight: 500 }}
              >
                {section}
              </Typography>
              {sectionDetail ? (
                <>
                  <Typography color="text.secondary" data-app-drag-region data-tauri-drag-region>
                    /
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    title={sectionDetail}
                    data-app-drag-region
                    data-tauri-drag-region
                  >
                    {sectionDetail}
                  </Typography>
                </>
              ) : null}
            </Stack>

            {showSearch ? (
              <Box
                component="form"
                onSubmit={submitSearch}
                data-app-no-drag
                sx={{
                  position: "relative",
                  width: { xs: 360, md: 520 },
                  maxWidth: "min(52vw, 560px)"
                }}
              >
                <TextField
                  inputRef={searchInputRef}
                  value={searchValue}
                  onChange={(event) => onSearchChange?.(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  size="small"
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: "background.default",
                      transition: "box-shadow 120ms ease, background-color 120ms ease",
                      "&.Mui-focused": {
                        bgcolor: "background.paper",
                        boxShadow: "0 0 0 3px rgba(25, 118, 210, 0.12)"
                      }
                    }
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Icon name="search" size={18} color="currentColor" />
                        </InputAdornment>
                      ),
                      endAdornment: searchValue ? undefined : (
                        <InputAdornment position="end">
                          <Chip
                            label="⌘K"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 22,
                              borderColor: "divider",
                              color: "text.secondary",
                              fontSize: 12
                            }}
                          />
                        </InputAdornment>
                      )
                    }
                  }}
                />
                {showResults ? (
                  <Paper
                    elevation={12}
                    sx={{
                      position: "absolute",
                      top: 48,
                      left: 0,
                      right: 0,
                      overflow: "hidden",
                      zIndex: 20,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 2
                    }}
                  >
                    <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
                          Command Center
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
                        </Typography>
                      </Box>
                    </Box>
                    <List dense disablePadding sx={{ maxHeight: 360, overflowY: "auto", py: 0.5 }}>
                      {searchResults.map((result) => (
                        <ListItemButton
                          key={result.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={result.onSelect}
                          sx={{
                            mx: 0.75,
                            my: 0.25,
                            borderRadius: 1,
                            alignItems: "flex-start"
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36, color: "text.secondary", pt: 0.25 }}>
                            <Icon name={result.icon} size={18} color="currentColor" />
                          </ListItemIcon>
                          <ListItemText
                            primary={<Typography noWrap sx={{ fontWeight: 500 }}>{result.label}</Typography>}
                            secondary={
                              <Typography variant="body2" color="text.secondary" noWrap>
                                {result.detail}
                              </Typography>
                            }
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Paper>
                ) : null}
              </Box>
            ) : null}

            <Box data-app-no-drag sx={{ display: "flex", justifyContent: "flex-end", minWidth: 120 }}>
              {toolbarAction}
            </Box>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            px: { xs: 2, md: 3 },
            py: { xs: 2, md: 3 },
            bgcolor: "background.default"
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function MaterialNavItem({ item }: { item: NavItem }) {
  const content = (active: boolean) => (
    <>
      <ListItemIcon sx={{ minWidth: 40, color: active ? "primary.main" : "text.secondary" }}>
        {item.scanActive ? (
          <Badge color="primary" variant="dot">
            <Icon name={item.icon} size={20} color="currentColor" />
          </Badge>
        ) : (
          <Icon name={item.icon} size={20} color="currentColor" />
        )}
      </ListItemIcon>
      <ListItemText primary={<Typography noWrap>{item.label}</Typography>} />
      {item.count != null && item.count > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {item.count}
        </Typography>
      ) : null}
    </>
  );

  if (item.to) {
    return (
      <ListItemButton
        component={NavLink}
        to={item.to}
        end={item.to === "/"}
        data-app-no-drag
        sx={{
          borderRadius: 1,
          mb: 0.5,
          "&.active": {
            bgcolor: "action.selected",
            color: "primary.main",
            "& .MuiListItemIcon-root": {
              color: "primary.main"
            }
          }
        }}
      >
        {content(false)}
      </ListItemButton>
    );
  }

  return (
    <ListItemButton data-app-no-drag onClick={item.onClick} sx={{ borderRadius: 1, mb: 0.5 }}>
      {content(false)}
    </ListItemButton>
  );
}
