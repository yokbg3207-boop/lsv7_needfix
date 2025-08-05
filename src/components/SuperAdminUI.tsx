import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, Building, MessageSquare, BarChart3, Settings,
  Search, Filter, Eye, Edit3, Trash2, Plus, RefreshCw,
  AlertCircle, CheckCircle, Crown, Award, ChefHat, X,
  TrendingUp, DollarSign, Gift, Clock, User, Mail,
  Phone, Calendar, MapPin, Star, Zap, Target, Loader2,
  MoreVertical, Ban, CheckCircle2, XCircle, Lock,
  Unlock, Database, Activity, Globe, Monitor, Send,
  MessageCircle, ArrowRight, ArrowLeft, Minus, UserX,
  RotateCcw, AlertTriangle, Save, FileText, Download,
  CreditCard, TrendingDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SupportService, SupportTicket, SupportMessage } from '../services/supportService';

interface SubscriptionStats {
  totalUsers: number;
  activeSubscriptions: number;
  trialUsers: number;
  paidUsers: number;
  totalRevenue: number;
  monthlyRevenue: number;
  churnRate: number;
  planDistribution: {
    trial: number;
    monthly: number;
    semiannual: number;
    annual: number;
  };
}

interface RecentSubscription {
  id: string;
  user_email: string;
  plan_type: string;
  status: string;
  created_at: string;
  current_period_end: string;
  restaurant_name?: string;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  settings: any;
  created_at: string;
  updated_at: string;
  owner_email?: string;
  owner_metadata?: any;
  total_customers?: number;
  total_rewards?: number;
  total_revenue?: number;
  total_points_issued?: number;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_end_date?: string;
}

interface Customer {
  id: string;
  restaurant_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  total_points: number;
  lifetime_points: number;
  current_tier: string;
  visit_count: number;
  total_spent: number;
  created_at: string;
  restaurant_name?: string;
  restaurant_slug?: string;
}

interface SystemStats {
  total_restaurants: number;
  total_customers: number;
  total_revenue: number;
  total_points_issued: number;
  active_tickets: number;
  monthly_growth: {
    restaurants: number;
    customers: number;
    revenue: number;
  };
}

const SuperAdminUI: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'subscriptions' | 'restaurants' | 'customers' | 'support' | 'analytics'>('overview');
  
  // Data states
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats>({
    totalUsers: 0,
    activeSubscriptions: 0,
    trialUsers: 0,
    paidUsers: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    churnRate: 0,
    planDistribution: { trial: 0, monthly: 0, semiannual: 0, annual: 0 }
  });
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [recentSubscriptions, setRecentSubscriptions] = useState<RecentSubscription[]>([]);
  
  // UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  
  // Form states
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
  const [restaurantForm, setRestaurantForm] = useState({
    name: '',
    slug: '',
    settings: {}
  });
  const [pointsAdjustment, setPointsAdjustment] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  useEffect(() => {
    checkAuthentication();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages();
      
      // Subscribe to real-time message updates
      const subscription = SupportService.subscribeToMessages(
        selectedTicket.id,
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => [...prev, payload.new]);
          }
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedTicket]);

  const checkAuthentication = () => {
    const authenticated = localStorage.getItem('super_admin_authenticated');
    const loginTime = localStorage.getItem('super_admin_login_time');
    
    if (authenticated && loginTime) {
      const loginDate = new Date(loginTime);
      const now = new Date();
      const hoursSinceLogin = (now.getTime() - loginDate.getTime()) / (1000 * 60 * 60);
      
      // Session expires after 8 hours
      if (hoursSinceLogin < 8) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('super_admin_authenticated');
        localStorage.removeItem('super_admin_login_time');
        window.location.href = '/super-admin-login';
      }
    } else {
      window.location.href = '/super-admin-login';
    }
    setLoading(false);
  };

  const fetchAllData = async () => {
    try {
      setRefreshing(true);
      setError(null);

      switch (activeTab) {
        case 'overview':
          await Promise.all([
            fetchSystemStats(),
            fetchSubscriptionStats()
          ]);
          break;
        case 'subscriptions':
          await Promise.all([
            fetchSubscriptionStats(),
            fetchRecentSubscriptions()
          ]);
          break;
        case 'restaurants':
          await fetchRestaurants();
          break;
        case 'customers':
          await fetchCustomers();
          break;
        case 'support':
          await fetchSupportTickets();
          break;
        case 'analytics':
          await Promise.all([
            fetchSystemStats(),
            fetchSubscriptionStats(),
            fetchRestaurants()
          ]);
          break;
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Failed to fetch data');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_system_statistics');
      if (error) throw error;
      setSystemStats(data);
    } catch (error) {
      console.error('Error fetching system stats:', error);
    }
  };

  const fetchSubscriptionStats = async () => {
    try {
      // Get total users
      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Get subscription stats
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('plan_type, status, created_at, current_period_end');

      if (subscriptions) {
        const activeSubscriptions = subscriptions.filter(s => s.status === 'active').length;
        const trialUsers = subscriptions.filter(s => s.plan_type === 'trial' && s.status === 'active').length;
        const paidUsers = subscriptions.filter(s => s.plan_type !== 'trial' && s.status === 'active').length;

        // Calculate plan distribution
        const planDistribution = {
          trial: subscriptions.filter(s => s.plan_type === 'trial').length,
          monthly: subscriptions.filter(s => s.plan_type === 'monthly').length,
          semiannual: subscriptions.filter(s => s.plan_type === 'semiannual').length,
          annual: subscriptions.filter(s => s.plan_type === 'annual').length,
        };

        // Calculate revenue (based on your pricing structure)
        const monthlyRevenue = (planDistribution.monthly * 2.99) + 
                              (planDistribution.semiannual * 9.99 / 6) + 
                              (planDistribution.annual * 19.99 / 12);
        
        const totalRevenue = (planDistribution.monthly * 2.99 * 6) + 
                            (planDistribution.semiannual * 9.99) + 
                            (planDistribution.annual * 19.99);

        // Calculate churn rate (simplified)
        const expiredSubscriptions = subscriptions.filter(s => s.status === 'expired').length;
        const churnRate = totalUsers > 0 ? (expiredSubscriptions / totalUsers) * 100 : 0;

        setSubscriptionStats({
          totalUsers: totalUsers || 0,
          activeSubscriptions,
          trialUsers,
          paidUsers,
          totalRevenue,
          monthlyRevenue,
          churnRate,
          planDistribution
        });
      }
    } catch (error) {
      console.error('Error loading subscription stats:', error);
    }
  };

  const fetchRecentSubscriptions = async () => {
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select(`
          id,
          plan_type,
          status,
          created_at,
          current_period_end,
          user:users(email),
          restaurant:restaurants(name)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const formatted = data.map(sub => ({
          id: sub.id,
          user_email: (sub.user as any)?.email || 'Unknown',
          plan_type: sub.plan_type,
          status: sub.status,
          created_at: sub.created_at,
          current_period_end: sub.current_period_end,
          restaurant_name: (sub.restaurant as any)?.name || 'N/A'
        }));
        setRecentSubscriptions(formatted);
      }
    } catch (error) {
      console.error('Error loading recent subscriptions:', error);
    }
  };

  const fetchRestaurants = async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_restaurants_for_super_admin');
      if (error) throw error;
      setRestaurants(data || []);
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      setError('Failed to fetch restaurants');
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_customers_for_super_admin');
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchSupportTickets = async () => {
    try {
      const tickets = await SupportService.getAllTickets();
      setSupportTickets(tickets);
    } catch (error) {
      console.error('Error fetching support tickets:', error);
    }
  };

  const fetchMessages = async () => {
    if (!selectedTicket) return;
    
    try {
      const messagesData = await SupportService.getTicketMessages(selectedTicket.id);
      setMessages(messagesData);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendSubscriptionReminder = async (subscriptionId: string) => {
    try {
      // In a real app, this would trigger an email service
      console.log('Sending reminder for subscription:', subscriptionId);
      alert('Subscription reminder sent successfully!');
    } catch (error) {
      console.error('Error sending reminder:', error);
      alert('Failed to send reminder');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('super_admin_authenticated');
    localStorage.removeItem('super_admin_login_time');
    window.location.href = '/super-admin-login';
  };

  const handleDeleteRestaurant = async (restaurantId: string, restaurantName: string) => {
    if (!confirm(`Are you sure you want to delete "${restaurantName}"? This will delete ALL associated data including customers, rewards, and transactions. This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('super_admin_delete_restaurant', {
        p_restaurant_id: restaurantId
      });

      if (error) throw error;

      await fetchRestaurants();
      alert('Restaurant deleted successfully');
    } catch (error: any) {
      console.error('Error deleting restaurant:', error);
      alert('Failed to delete restaurant: ' + error.message);
    }
  };

  const handleUpdateRestaurant = async () => {
    if (!editingRestaurant) return;

    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          name: restaurantForm.name,
          slug: restaurantForm.slug,
          settings: restaurantForm.settings
        })
        .eq('id', editingRestaurant.id);

      if (error) throw error;

      setEditingRestaurant(null);
      setShowRestaurantModal(false);
      await fetchRestaurants();
      alert('Restaurant updated successfully');
    } catch (error: any) {
      console.error('Error updating restaurant:', error);
      alert('Failed to update restaurant: ' + error.message);
    }
  };

  const handleAdjustCustomerPoints = async () => {
    if (!selectedCustomer || pointsAdjustment === 0) return;

    try {
      const { error } = await supabase.rpc('super_admin_adjust_customer_points', {
        p_customer_id: selectedCustomer.id,
        p_points_adjustment: pointsAdjustment,
        p_description: adjustmentReason || 'Super admin adjustment'
      });

      if (error) throw error;

      setSelectedCustomer(null);
      setShowCustomerModal(false);
      setPointsAdjustment(0);
      setAdjustmentReason('');
      await fetchCustomers();
      alert(`Successfully adjusted points for ${selectedCustomer.first_name} ${selectedCustomer.last_name}`);
    } catch (error: any) {
      console.error('Error adjusting customer points:', error);
      alert('Failed to adjust points: ' + error.message);
    }
  };

  const handleResetAllData = async () => {
    if (!confirm('Are you sure you want to reset ALL customer data across the entire platform? This will reset points, transactions, and redemptions for ALL customers. This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.rpc('super_admin_reset_customer_data');
      if (error) throw error;

      await fetchAllData();
      alert('All customer data has been reset successfully');
    } catch (error: any) {
      console.error('Error resetting data:', error);
      alert('Failed to reset data: ' + error.message);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: string) => {
    try {
      await SupportService.updateTicketStatus(ticketId, status as any, 'Super Admin');
      await fetchSupportTickets();
    } catch (error: any) {
      console.error('Error updating ticket status:', error);
      alert('Failed to update ticket status: ' + error.message);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    try {
      setSendingMessage(true);
      
      await SupportService.sendMessage({
        ticket_id: selectedTicket.id,
        sender_type: 'super_admin',
        sender_id: 'super_admin',
        message: newMessage
      });

      setNewMessage('');
      await fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const openRestaurantModal = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setEditingRestaurant(restaurant);
    setRestaurantForm({
      name: restaurant.name,
      slug: restaurant.slug,
      settings: restaurant.settings || {}
    });
    setShowRestaurantModal(true);
  };

  const openCustomerModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setPointsAdjustment(0);
    setAdjustmentReason('');
    setShowCustomerModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Super Admin...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Super Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Unified platform management & subscriptions</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={fetchAllData}
              disabled={refreshing}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh All Data"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowResetModal(true)}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
              title="Reset All Customer Data"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset Data
            </button>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">Super Admin</p>
                <p className="text-xs text-gray-500">System Administrator</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="px-6">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: 'System Overview', icon: BarChart3 },
              { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
              { id: 'restaurants', label: 'Restaurants', icon: Building },
              { id: 'customers', label: 'All Customers', icon: Users },
              { id: 'support', label: 'Support Tickets', icon: MessageSquare },
              { id: 'analytics', label: 'Analytics', icon: TrendingUp }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-red-500 text-red-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* System Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">System Overview</h2>
              <p className="text-gray-600">Complete overview of the TableLoyalty platform and subscriptions</p>
            </div>

            {/* Primary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.totalUsers}</p>
                  </div>
                </div>
                <p className="text-xs text-blue-600">Platform registered users</p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Active Subscriptions</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.activeSubscriptions}</p>
                  </div>
                </div>
                <p className="text-xs text-green-600">{subscriptionStats.paidUsers} paid users</p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Monthly Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(subscriptionStats.monthlyRevenue)}</p>
                  </div>
                </div>
                <p className="text-xs text-purple-600">Recurring revenue</p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Churn Rate</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.churnRate.toFixed(1)}%</p>
                  </div>
                </div>
                <p className="text-xs text-red-600">Monthly churn</p>
              </div>
            </div>

            {/* Secondary Stats Grid */}
            {systemStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                      <Building className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Restaurants</p>
                      <p className="text-2xl font-bold text-gray-900">{systemStats.total_restaurants}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green-600">+{systemStats.monthly_growth.restaurants} this month</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                      <Users className="h-6 w-6 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Customers</p>
                      <p className="text-2xl font-bold text-gray-900">{systemStats.total_customers.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green-600">+{systemStats.monthly_growth.customers} this month</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <Zap className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Points Issued</p>
                      <p className="text-2xl font-bold text-gray-900">{systemStats.total_points_issued.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Total loyalty points</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-pink-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Active Tickets</p>
                      <p className="text-2xl font-bold text-gray-900">{systemStats.active_tickets}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Pending support</p>
                </div>
              </div>
            )}

            {/* Plan Distribution & Revenue Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Plan Distribution</h3>
                <div className="space-y-4">
                  {Object.entries(subscriptionStats.planDistribution).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 capitalize">
                        {plan === 'semiannual' ? 'Semi-annual' : plan}
                      </span>
                      <div className="flex items-center space-x-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full"
                            style={{ width: `${subscriptionStats.totalUsers > 0 ? (count / subscriptionStats.totalUsers) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-gray-900 w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Revenue</span>
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(subscriptionStats.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Monthly Recurring</span>
                    <span className="text-lg font-bold text-green-600">{formatCurrency(subscriptionStats.monthlyRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Trial Users</span>
                    <span className="text-lg font-bold text-blue-600">{subscriptionStats.trialUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Paid Users</span>
                    <span className="text-lg font-bold text-purple-600">{subscriptionStats.paidUsers}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Health */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Database</p>
                    <p className="text-sm text-green-700">Operational</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                  <Activity className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">API Services</p>
                    <p className="text-sm text-green-700">All systems running</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                  <Globe className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Platform Status</p>
                    <p className="text-sm text-green-700">Fully operational</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Subscription Management</h2>
                <p className="text-gray-600">Manage all platform subscriptions and billing</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search subscriptions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Subscription Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.totalUsers}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CreditCard className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.activeSubscriptions}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(subscriptionStats.monthlyRevenue)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Churn Rate</p>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionStats.churnRate.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Subscriptions Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Subscriptions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Restaurant
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentSubscriptions
                      .filter(subscription => 
                        subscription.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        subscription.plan_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        subscription.restaurant_name?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((subscription) => (
                      <tr key={subscription.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {subscription.user_email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {subscription.restaurant_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                          {subscription.plan_type === 'semiannual' ? 'Semi-annual' : subscription.plan_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(subscription.status)}`}>
                            {subscription.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(subscription.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(subscription.current_period_end)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => sendSubscriptionReminder(subscription.id)}
                            className="text-red-600 hover:text-red-900 mr-3"
                            title="Send Reminder"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button 
                            className="text-gray-600 hover:text-gray-900"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Restaurants Tab */}
        {activeTab === 'restaurants' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Restaurant Management</h2>
                <p className="text-gray-600">Manage all restaurants on the platform</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search restaurants..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Restaurants Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {restaurants
                .filter(restaurant => 
                  restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  restaurant.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  restaurant.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((restaurant) => (
                <div key={restaurant.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#1E2A78] to-[#3B4B9A] rounded-xl flex items-center justify-center">
                          <ChefHat className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{restaurant.name}</h3>
                          <p className="text-sm text-gray-600">/{restaurant.slug}</p>
                          <p className="text-xs text-gray-500">{restaurant.owner_email}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-1">
                        <button
                          onClick={() => openRestaurantModal(restaurant)}
                          className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                          title="Edit Restaurant"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRestaurant(restaurant.id, restaurant.name)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Restaurant"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Subscription Status */}
                    {restaurant.subscription_status && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(restaurant.subscription_status)}`}>
                            <CreditCard className="h-3 w-3" />
                            {restaurant.subscription_plan?.charAt(0).toUpperCase() + restaurant.subscription_plan?.slice(1)} Plan
                          </span>
                          <span className="text-xs text-gray-500">
                            {restaurant.subscription_end_date && `Until ${formatDate(restaurant.subscription_end_date)}`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Restaurant Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="h-4 w-4 text-blue-600" />
                          <span className="text-xs text-blue-600">Customers</span>
                        </div>
                        <p className="text-lg font-bold text-blue-900">{restaurant.total_customers || 0}</p>
                      </div>
                      
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4 text-green-600" />
                          <span className="text-xs text-green-600">Revenue</span>
                        </div>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(restaurant.total_revenue || 0)}</p>
                      </div>
                      
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Gift className="h-4 w-4 text-purple-600" />
                          <span className="text-xs text-purple-600">Rewards</span>
                        </div>
                        <p className="text-lg font-bold text-purple-900">{restaurant.total_rewards || 0}</p>
                      </div>
                      
                      <div className="bg-yellow-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="h-4 w-4 text-yellow-600" />
                          <span className="text-xs text-yellow-600">Points</span>
                        </div>
                        <p className="text-lg font-bold text-yellow-900">{restaurant.total_points_issued?.toLocaleString() || 0}</p>
                      </div>
                    </div>

                    {/* Created Date */}
                    <div className="pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Created {formatDate(restaurant.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Customer Management</h2>
                <p className="text-gray-600">View and manage all customers across all restaurants</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Customer</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Restaurant</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Tier</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Points</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Spent</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Visits</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Joined</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {customers
                      .filter(customer => 
                        customer.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        customer.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        customer.restaurant_name?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#1E2A78] to-[#3B4B9A] rounded-full flex items-center justify-center text-white text-sm font-medium">
                              {customer.first_name[0]}{customer.last_name[0]}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{customer.first_name} {customer.last_name}</p>
                              <p className="text-sm text-gray-500">{customer.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{customer.restaurant_name}</p>
                          <p className="text-sm text-gray-500">/{customer.restaurant_slug}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            customer.current_tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                            customer.current_tier === 'silver' ? 'bg-gray-100 text-gray-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {customer.current_tier === 'gold' ? <Crown className="h-3 w-3" /> :
                             customer.current_tier === 'silver' ? <Award className="h-3 w-3" /> :
                             <ChefHat className="h-3 w-3" />}
                            {customer.current_tier.charAt(0).toUpperCase() + customer.current_tier.slice(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{customer.total_points.toLocaleString()}</p>
                          <p className="text-sm text-gray-500">{customer.lifetime_points.toLocaleString()} lifetime</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{formatCurrency(customer.total_spent)}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{customer.visit_count}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm text-gray-500">{formatDate(customer.created_at)}</p>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => openCustomerModal(customer)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Adjust Points"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Support Tab */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Support Tickets</h2>
                <p className="text-gray-600">Manage support requests from all restaurants</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-300px)]">
              {/* Tickets Sidebar */}
              <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Support Tickets</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {supportTickets
                    .filter(ticket => 
                      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      ticket.restaurant?.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                        selectedTicket?.id === ticket.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                          {ticket.title}
                        </h4>
                        <div className="flex gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(ticket.status)}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                        {ticket.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {ticket.restaurant?.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(ticket.created_at)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Area */}
              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl flex flex-col">
                {selectedTicket ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-semibold text-gray-900">{selectedTicket.title}</h2>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedTicket.status)}`}>
                              {selectedTicket.status.replace('_', ' ')}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(selectedTicket.priority)}`}>
                              {selectedTicket.priority}
                            </span>
                            <span className="text-xs text-gray-500">
                              {selectedTicket.restaurant?.name}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {selectedTicket.status === 'open' && (
                            <button
                              onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'in_progress')}
                              className="px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 transition-colors"
                            >
                              Start Progress
                            </button>
                          )}
                          {selectedTicket.status === 'in_progress' && (
                            <button
                              onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'resolved')}
                              className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                            >
                              Mark Resolved
                            </button>
                          )}
                          {selectedTicket.status === 'resolved' && (
                            <button
                              onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'closed')}
                              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              Close Ticket
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Ticket Description */}
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{selectedTicket.description}</p>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender_type === 'super_admin' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            message.sender_type === 'super_admin'
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-200 text-gray-900'
                          }`}>
                            <p className="text-sm">{message.message}</p>
                            <p className={`text-xs mt-1 ${
                              message.sender_type === 'super_admin' ? 'text-red-200' : 'text-gray-500'
                            }`}>
                              {formatDate(message.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Message Input */}
                    <div className="p-4 border-t border-gray-200">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !sendingMessage && handleSendMessage()}
                          placeholder="Type your response..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={sendingMessage || !newMessage.trim()}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {sendingMessage ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <MessageCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Ticket</h3>
                      <p className="text-gray-500">Choose a support ticket to view the conversation</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Platform Analytics</h2>
              <p className="text-gray-600">Comprehensive analytics across all restaurants and subscriptions</p>
            </div>

            {/* Combined Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Platform Growth */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Growth</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Restaurants</span>
                    <span className="font-bold text-gray-900">{systemStats?.total_restaurants || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Customers</span>
                    <span className="font-bold text-gray-900">{systemStats?.total_customers.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Active Subscriptions</span>
                    <span className="font-bold text-gray-900">{subscriptionStats.activeSubscriptions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Monthly Revenue</span>
                    <span className="font-bold text-gray-900">{formatCurrency(subscriptionStats.monthlyRevenue)}</span>
                  </div>
                </div>
              </div>

              {/* Top Performing Restaurants */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Restaurants</h3>
                <div className="space-y-3">
                  {restaurants
                    .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
                    .slice(0, 5)
                    .map((restaurant, index) => (
                    <div key={restaurant.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1E2A78] to-[#3B4B9A] rounded-lg flex items-center justify-center text-white text-sm font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{restaurant.name}</p>
                        <p className="text-sm text-gray-500">{formatCurrency(restaurant.total_revenue || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{restaurant.total_customers || 0}</p>
                        <p className="text-xs text-gray-500">customers</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subscription Analytics */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Insights</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Revenue</span>
                    <span className="font-bold text-gray-900">{formatCurrency(subscriptionStats.totalRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Churn Rate</span>
                    <span className="font-bold text-red-600">{subscriptionStats.churnRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Trial Users</span>
                    <span className="font-bold text-blue-600">{subscriptionStats.trialUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Paid Users</span>
                    <span className="font-bold text-green-600">{subscriptionStats.paidUsers}</span>
                  </div>
                </div>
              </div>

              {/* Platform Health */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Health</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900 text-sm">Database Status</p>
                      <p className="text-xs text-green-700">Operational</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <Activity className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900 text-sm">API Services</p>
                      <p className="text-xs text-green-700">All systems running</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <Globe className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900 text-sm">Platform Status</p>
                      <p className="text-xs text-green-700">Fully operational</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Restaurant Edit Modal */}
      {showRestaurantModal && selectedRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Restaurant Details & Management</h3>
              <button
                onClick={() => {
                  setShowRestaurantModal(false);
                  setSelectedRestaurant(null);
                  setEditingRestaurant(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Basic Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                    <input
                      type="text"
                      value={restaurantForm.name}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                    <input
                      type="text"
                      value={restaurantForm.slug}
                      onChange={(e) => setRestaurantForm({ ...restaurantForm, slug: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Owner Email</p>
                      <p className="font-medium text-gray-900">{selectedRestaurant.owner_email}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Created</p>
                      <p className="font-medium text-gray-900">{formatDate(selectedRestaurant.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Performance Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Total Customers</p>
                    <p className="text-xl font-bold text-gray-900">{selectedRestaurant.total_customers || 0}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Total Revenue</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedRestaurant.total_revenue || 0)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Total Rewards</p>
                    <p className="text-xl font-bold text-gray-900">{selectedRestaurant.total_rewards || 0}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm text-gray-600">Points Issued</p>
                    <p className="text-xl font-bold text-gray-900">{selectedRestaurant.total_points_issued?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Loyalty Settings</h4>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Point Value (AED)</span>
                    <span className="font-medium text-gray-900">{selectedRestaurant.settings?.pointValueAED || 0.05}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Blanket Mode</span>
                    <span className="font-medium text-gray-900">
                      {selectedRestaurant.settings?.blanketMode?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  {selectedRestaurant.settings?.blanketMode?.enabled && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mode Type</span>
                      <span className="font-medium text-gray-900">
                        {selectedRestaurant.settings.blanketMode.type?.charAt(0).toUpperCase() + selectedRestaurant.settings.blanketMode.type?.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRestaurantModal(false);
                    setSelectedRestaurant(null);
                    setEditingRestaurant(null);
                  }}
                  className="flex-1 py-3 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateRestaurant}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-xl hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Points Adjustment Modal */}
      {showCustomerModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Adjust Customer Points</h3>
              <button
                onClick={() => {
                  setShowCustomerModal(false);
                  setSelectedCustomer(null);
                  setPointsAdjustment(0);
                  setAdjustmentReason('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer Info */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#1E2A78] to-[#3B4B9A] rounded-full flex items-center justify-center text-white font-medium">
                    {selectedCustomer.first_name[0]}{selectedCustomer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </p>
                    <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                    <p className="text-sm text-gray-500">
                      Current Points: {selectedCustomer.total_points.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points Adjustment
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPointsAdjustment(Math.max(-selectedCustomer.total_points, pointsAdjustment - 10))}
                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    value={pointsAdjustment}
                    onChange={(e) => setPointsAdjustment(parseInt(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-center focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <button
                    onClick={() => setPointsAdjustment(pointsAdjustment + 10)}
                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  New balance: {(selectedCustomer.total_points + pointsAdjustment).toLocaleString()} points
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Adjustment
                </label>
                <textarea
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter reason for points adjustment..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setSelectedCustomer(null);
                    setPointsAdjustment(0);
                    setAdjustmentReason('');
                  }}
                  className="flex-1 py-3 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustCustomerPoints}
                  disabled={pointsAdjustment === 0}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Zap className="h-4 w-4" />
                  Adjust Points
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Data Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Reset Customer Data</h3>
              <button
                onClick={() => setShowResetModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900 mb-1">Warning</p>
                    <p className="text-red-800 text-sm">
                      This will reset ALL customer data across the entire platform including:
                    </p>
                    <ul className="text-red-800 text-sm mt-2 list-disc list-inside">
                      <li>All customer points (set to 0)</li>
                      <li>All transaction history</li>
                      <li>All reward redemptions</li>
                      <li>Visit counts and spending data</li>
                    </ul>
                    <p className="text-red-800 text-sm mt-2 font-medium">
                      This action cannot be undone!
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-3 px-4 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowResetModal(false);
                    handleResetAllData();
                  }}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-xl hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminUI;