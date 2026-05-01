import { createTheme } from "@mui/material/styles";

export const materialTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2"
    },
    secondary: {
      main: "#9c27b0"
    },
    error: {
      main: "#d32f2f"
    },
    warning: {
      main: "#ed6c02"
    },
    info: {
      main: "#0288d1"
    },
    success: {
      main: "#2e7d32"
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff"
    }
  },
  shape: {
    borderRadius: 4
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        color: "default"
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none"
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 44
        }
      }
    },
    MuiButton: {
      defaultProps: {
        variant: "contained"
      },
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          minHeight: 36
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500
        }
      }
    }
  }
});
